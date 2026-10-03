/* Deploys LearnBox Sessions to the owner's AWS account, in order:
     1. the Lambda bundles (scripts/build-lambda.mjs);
     2. the stack (infra/), with the secrets from .env.local in the environment;
     3. the pages, built with the stack's outputs (API address, user pool, events API), zipped and handed to Amplify Hosting
        as a deployment of the branch `main`.
   Run from the repo root: node scripts/deploy.mjs [--stack-only | --pages-only]
   Reads from .env.local: PAYU_KEY, PAYU_SALT, PAYU_ENV, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ALERT_EMAIL, and optionally
   SITE_DOMAIN (sessions.learnbox.one, once its DNS records are in place: infra/README.md) and SES_FROM (e.g. no-reply@learnbox.one)
   once SES has production access. AWS_PROFILE defaults to "personal". Nothing here is written to git. */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env.local');
const PROFILE = process.env.AWS_PROFILE || 'personal';
const REGION = 'ap-south-1';
const mode = process.argv[2] ?? '';

/* .env.local, as KEY=value lines, into this process's environment (existing variables win). */
const fileEnv = Object.fromEntries(fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
for (const [k, v] of Object.entries(fileEnv)) process.env[k] ??= v;
if (!process.env.ALERT_EMAIL) throw new Error('ALERT_EMAIL is not in .env.local: where the budget alert and the alarms write');
if (process.env.PAYU_ENV === 'standin') throw new Error('PAYU_ENV=standin is for development; use live (real money) or test, or leave it unset for PayU\'s test site');
for (const k of ['PAYU_KEY', 'PAYU_SALT', 'ANTHROPIC_API_KEY']) if (!process.env[k]) console.warn(`${k} is not set: that feature will be off on the site`);

const run = (cmd, opts = {}) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
};
const aws = (args) => {
  const r = spawnSync('aws', [...args, '--profile', PROFILE, '--region', REGION, '--output', 'json'], { encoding: 'utf8', shell: true });
  if (r.status !== 0) throw new Error(r.stderr || `aws ${args[0]} failed`);
  return r.stdout ? JSON.parse(r.stdout) : null;
};
const sleep = (ms) => new Promise((f) => setTimeout(f, ms));

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
].filter(Boolean).join(' ');
const outputsFile = path.join(ROOT, 'infra', 'outputs.json');
const outputs = () => JSON.parse(fs.readFileSync(outputsFile, 'utf8')).LearnBoxSessions;
const deployStack = (siteUrl) => run(`npx cdk deploy --profile ${PROFILE} --require-approval never --outputs-file outputs.json ${context(siteUrl)}`, { cwd: path.join(ROOT, 'infra') });

if (mode !== '--pages-only') {
  run('node scripts/build-lambda.mjs');
  /* The site's address is one of the stack's own outputs, so the first deploy does not know it; a second pass sets it. */
  const known = process.env.SITE_DOMAIN ? `https://${process.env.SITE_DOMAIN}` : fs.existsSync(outputsFile) ? outputs().SiteUrl : undefined;
  const before = JSON.stringify([known, origins()]);
  deployStack(known);
  if (JSON.stringify([outputs().SiteUrl, origins()]) !== before) deployStack(outputs().SiteUrl);
}

if (mode !== '--stack-only') {
  const o = outputs();
  const pageEnv = {
    ...process.env,
    NEXT_PUBLIC_API_URL: o.ApiUrl,
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

  /* Amplify takes the files as one zip (paths with forward slashes, from the root of the site). Windows' own tar writes zips. */
  const zip = path.join(ROOT, 'dist', 'site.zip');
  fs.mkdirSync(path.dirname(zip), { recursive: true });
  fs.rmSync(zip, { force: true });
  const tar = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
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
  console.log(`\nSite: ${o.SiteUrl}\nAPI: ${o.ApiUrl}\nUser pool: ${o.UserPoolId}`);
}
