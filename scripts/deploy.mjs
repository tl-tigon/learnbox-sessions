/* Deploys LearnBox Sessions to the owner's AWS account, in order:
     1. the Lambda bundles (scripts/build-lambda.mjs);
     2. the stack (infra/), with the secrets from .env.local in the environment;
     3. the pages, built with the stack's outputs (API address, user pool, events API), zipped and handed to Amplify Hosting
        as a deployment of the branch `main`.
   Run from the repo root: node scripts/deploy.mjs [--stack-only | --pages-only | --code]
     --code: the Lambda bundles straight into the three functions, then the pages; the stack is left as it is. This is what a push
     to main runs in GitHub Actions (.github/workflows/deploy.yml), with a role that may do only that and no .env.local: the stack,
     the routes and every secret are deployed from this machine.
   Reads from .env.local (when present): PAYU_KEY, PAYU_SALT, PAYU_ENV, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ALERT_EMAIL, GITHUB_REPO
   (owner/name, for the deploy role), and optionally SITE_DOMAIN (sessions.learnbox.one, once its DNS records are in place), API_DOMAIN
   with API_CERTIFICATE_ARN (the API's own name and its issued certificate in ap-south-1; the pages call that name once its DNS record
   resolves, the gateway's address until then; see infra/README.md) and SES_FROM (e.g. no-reply@learnbox.one) once SES has production
   access. AWS_PROFILE defaults to "personal" (unset it to use the ambient credentials, as CI does). Nothing here is written to git. */
import { execSync, spawnSync } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env.local');
const PROFILE = process.env.CI ? '' : process.env.AWS_PROFILE || 'personal';
const REGION = 'ap-south-1';
const STACK = 'LearnBoxSessions';
const GROUPS = ['audience', 'host', 'billing'];
/* Windows' own tar writes zips; Amplify and Lambda both take one. */
const tar = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
const mode = process.argv[2] ?? '';
const stackToo = mode === '' || mode === '--stack-only';
const pagesToo = mode !== '--stack-only';

/* .env.local, as KEY=value lines, into this process's environment (existing variables win). */
if (fs.existsSync(ENV_FILE)) {
  const fileEnv = Object.fromEntries(fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
  for (const [k, v] of Object.entries(fileEnv)) process.env[k] ??= v;
}
if (stackToo) {
  if (!process.env.ALERT_EMAIL) throw new Error('ALERT_EMAIL is not in .env.local: where the budget alert and the alarms write');
  if (process.env.PAYU_ENV === 'standin') throw new Error('PAYU_ENV=standin is for development; use live (real money) or test, or leave it unset for PayU\'s test site');
  for (const k of ['PAYU_KEY', 'PAYU_SALT', 'ANTHROPIC_API_KEY']) if (!process.env[k]) console.warn(`${k} is not set: that feature will be off on the site`);
}

const run = (cmd, opts = {}) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
};
const profileArgs = PROFILE ? ['--profile', PROFILE] : [];
const aws = (args) => {
  const r = spawnSync('aws', [...args, ...profileArgs, '--region', REGION, '--output', 'json'], { encoding: 'utf8', shell: true });
  if (r.status !== 0) throw new Error(r.stderr || `aws ${args[0]} failed`);
  return r.stdout ? JSON.parse(r.stdout) : null;
};
const sleep = (ms) => new Promise((f) => setTimeout(f, ms));

/* The stack's outputs: the file the last local deploy wrote, or the stack itself (CI has no file). */
const outputsFile = path.join(ROOT, 'infra', 'outputs.json');
const outputs = () => {
  if (fs.existsSync(outputsFile)) return JSON.parse(fs.readFileSync(outputsFile, 'utf8'))[STACK];
  const { Stacks } = aws(['cloudformation', 'describe-stacks', '--stack-name', STACK]);
  return Object.fromEntries(Stacks[0].Outputs.map((o) => [o.OutputKey, o.OutputValue]));
};

if (stackToo) {
  run('node scripts/build-lambda.mjs');
  /* Each function's concurrency is reserved (a spending cap) only when the account's Lambda limit has room: 160 reserved plus the
     10 AWS keeps unreserved. A new account's limit is 10 in total; infra/README.md says how to raise it. */
  const lambdaLimit = aws(['lambda', 'get-account-settings']).AccountLimit.ConcurrentExecutions;
  const reserve = lambdaLimit >= 170;
  console.log(`Lambda concurrency limit ${lambdaLimit}: ${reserve ? 'reserving per function' : 'no per-function reservation (raise the limit to 1000 for a real audience)'}`);
  /* CORS: the Amplify domain and the custom domain, once the first deploy has made the app. */
  const origins = () => (fs.existsSync(outputsFile) ? [...new Set([outputs().SiteUrl, outputs().AmplifyDomain && `https://${outputs().AmplifyDomain}`].filter(Boolean))] : []);
  const context = (siteUrl) => [
    `-c "alertEmail=${process.env.ALERT_EMAIL}"`,
    `-c reserve=${reserve}`,
    siteUrl ? `-c siteUrl=${siteUrl}` : '',
    origins().length ? `-c origins=${origins().join(',')}` : '',
    process.env.SES_FROM ? `-c sesFrom=${process.env.SES_FROM}` : '',
    process.env.SITE_DOMAIN ? `-c domain=${process.env.SITE_DOMAIN}` : '',
    process.env.API_DOMAIN ? `-c apiDomain=${process.env.API_DOMAIN} -c apiCertificateArn=${process.env.API_CERTIFICATE_ARN}` : '',
    process.env.GITHUB_REPO ? `-c githubRepo=${process.env.GITHUB_REPO}` : '',
  ].filter(Boolean).join(' ');
  const deployStack = (siteUrl) => run(`npx cdk deploy ${profileArgs.join(' ')} --require-approval never --outputs-file outputs.json ${context(siteUrl)}`, { cwd: path.join(ROOT, 'infra') });
  /* The site's address is one of the stack's own outputs, so the first deploy does not know it; a second pass sets it. */
  const known = process.env.SITE_DOMAIN ? `https://${process.env.SITE_DOMAIN}` : fs.existsSync(outputsFile) ? outputs().SiteUrl : undefined;
  const before = JSON.stringify([known, origins()]);
  deployStack(known);
  if (JSON.stringify([outputs().SiteUrl, origins()]) !== before) deployStack(outputs().SiteUrl);
}

if (mode === '--code') {
  run('node scripts/build-lambda.mjs');
  for (const group of GROUPS) {
    const name = `${STACK}-${group}`;
    const zip = path.join(ROOT, 'dist', 'lambda', `${group}.zip`);
    fs.rmSync(zip, { force: true });
    run(`"${tar}" -a -cf "${zip}" -C dist/lambda ${group}.js`);
    aws(['lambda', 'update-function-code', '--function-name', name, '--zip-file', `fileb://${zip}`]);
    aws(['lambda', 'wait', 'function-updated', '--function-name', name]);
    console.log(`${name}: code updated`);
  }
}

if (pagesToo) {
  const o = outputs();
  /* The API's own name, once its DNS record exists; the gateway's address until then, so the pages always reach an API. */
  const apiName = process.env.API_DOMAIN && (await dns.resolveCname(process.env.API_DOMAIN).then(() => true, () => dns.lookup(process.env.API_DOMAIN).then(() => true, () => false)));
  const apiUrl = apiName ? `https://${process.env.API_DOMAIN}` : o.ApiUrl;
  if (process.env.API_DOMAIN && !apiName) console.warn(`${process.env.API_DOMAIN} does not resolve yet: the pages call ${o.ApiUrl}. Deploy the pages again once the DNS record is in.`);
  const pageEnv = {
    ...process.env,
    NEXT_PUBLIC_API_URL: apiUrl,
    NEXT_PUBLIC_AUTH_MODE: 'cognito',
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: o.UserPoolId,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: o.UserPoolClientId,
    NEXT_PUBLIC_EVENTS_HTTP_DOMAIN: o.EventsHttpDomain,
    NEXT_PUBLIC_EVENTS_REALTIME_DOMAIN: o.EventsRealtimeDomain,
    NEXT_PUBLIC_EVENTS_API_KEY: o.EventsApiKey,
  };
  delete pageEnv.NEXT_DIST_DIR;
  fs.rmSync(path.join(ROOT, 'out'), { recursive: true, force: true });
  run('npx next build', { env: pageEnv });
  run('git checkout tsconfig.json');

  /* Amplify takes the files as one zip (paths with forward slashes, from the root of the site). */
  const zip = path.join(ROOT, 'dist', 'site.zip');
  fs.mkdirSync(path.dirname(zip), { recursive: true });
  fs.rmSync(zip, { force: true });
  run(`"${tar}" -a -cf "${zip}" -C out ${fs.readdirSync(path.join(ROOT, 'out')).map((f) => `"${f}"`).join(' ')}`);

  const d = aws(['amplify', 'create-deployment', '--app-id', o.AmplifyAppId, '--branch-name', 'main']);
  const put = await fetch(d.zipUploadUrl, { method: 'PUT', body: fs.readFileSync(zip), headers: { 'content-type': 'application/zip' } });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);
  aws(['amplify', 'start-deployment', '--app-id', o.AmplifyAppId, '--branch-name', 'main', '--job-id', d.jobId]);
  process.stdout.write(`\nAmplify deployment ${d.jobId} `);
  for (;;) {
    await sleep(5000);
    const { job } = aws(['amplify', 'get-job', '--app-id', o.AmplifyAppId, '--branch-name', 'main', '--job-id', d.jobId]);
    const status = job.summary.status;
    if (status === 'SUCCEED') { console.log('done.'); break; }
    if (status === 'FAILED' || status === 'CANCELLED') throw new Error(`Amplify deployment ${status}: ${JSON.stringify(job.steps.map((s) => [s.stepName, s.status, s.statusReason]))}`);
    process.stdout.write('.');
  }
  console.log(`\nSite: ${o.SiteUrl}\nAPI: ${apiUrl}${o.ApiDomainTarget ? ` (DNS: ${process.env.API_DOMAIN} CNAME ${o.ApiDomainTarget})` : ''}\nUser pool: ${o.UserPoolId}`);
}
