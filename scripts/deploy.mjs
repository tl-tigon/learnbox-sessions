/* Deploys the API side of LearnBox Sessions to the owner's AWS account: the Lambda bundles (scripts/build-lambda.mjs) and the
   stack (infra/), with the secrets from .env.local in the environment. The pages are not deployed from here: Amplify Hosting builds
   them from GitHub on every push to main (amplify.yml).
   Run from the repo root: node scripts/deploy.mjs [--code]
     --code: the Lambda bundles straight into the three functions, nothing else (an API change with no change to the stack or routes).
   Reads from .env.local: PAYU_KEY, PAYU_SALT, PAYU_ENV, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ALERT_EMAIL, SITE_DOMAIN (the site's name,
   where the server sends a buyer back), AMPLIFY_DOMAIN (the app's own main.<id>.amplifyapp.com name, also allowed by CORS), API_DOMAIN
   with API_CERTIFICATE_ARN (the API's own name and its issued certificate in ap-south-1) and SES_FROM (e.g. no-reply@learnbox.one).
   AWS_PROFILE defaults to "personal". Nothing here is written to git. */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env.local');
const PROFILE = process.env.AWS_PROFILE || 'personal';
const REGION = 'ap-south-1';
const STACK = 'LearnBoxSessions';
const GROUPS = ['audience', 'host', 'billing'];
const mode = process.argv[2] ?? '';

/* .env.local, as KEY=value lines, into this process's environment (existing variables win). */
const fileEnv = Object.fromEntries(fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
for (const [k, v] of Object.entries(fileEnv)) process.env[k] ??= v;

const run = (cmd, opts = {}) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
};
const aws = (args) => {
  const r = spawnSync('aws', [...args, '--profile', PROFILE, '--region', REGION, '--output', 'json'], { encoding: 'utf8', shell: true });
  if (r.status !== 0) throw new Error(r.stderr || `aws ${args[0]} failed`);
  return r.stdout ? JSON.parse(r.stdout) : null;
};

run('node scripts/build-lambda.mjs');

if (mode === '--code') {
  /* Windows' own tar writes zips. */
  const tar = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
  for (const group of GROUPS) {
    const zip = path.join(ROOT, 'dist', 'lambda', `${group}.zip`);
    fs.rmSync(zip, { force: true });
    run(`"${tar}" -a -cf "${zip}" -C dist/lambda ${group}.js`);
    aws(['lambda', 'update-function-code', '--function-name', `${STACK}-${group}`, '--zip-file', `fileb://${zip}`]);
    aws(['lambda', 'wait', 'function-updated', '--function-name', `${STACK}-${group}`]);
    console.log(`${STACK}-${group}: code updated`);
  }
} else {
  for (const k of ['ALERT_EMAIL', 'SITE_DOMAIN', 'AMPLIFY_DOMAIN']) if (!process.env[k]) throw new Error(`${k} is not in .env.local`);
  if (process.env.PAYU_ENV === 'standin') throw new Error('PAYU_ENV=standin is for development; use live (real money) or test, or leave it unset for PayU\'s test site');
  for (const k of ['PAYU_KEY', 'PAYU_SALT', 'ANTHROPIC_API_KEY']) if (!process.env[k]) console.warn(`${k} is not set: that feature will be off on the site`);
  /* Each function's concurrency is reserved (a spending cap) only when the account's Lambda limit has room: 160 reserved plus the
     10 AWS keeps unreserved. A new account's limit is 10 in total; infra/README.md says how to raise it. */
  const lambdaLimit = aws(['lambda', 'get-account-settings']).AccountLimit.ConcurrentExecutions;
  const reserve = lambdaLimit >= 170;
  console.log(`Lambda concurrency limit ${lambdaLimit}: ${reserve ? 'reserving per function' : 'no per-function reservation (raise the limit to 1000 for a real audience)'}`);
  const siteUrl = `https://${process.env.SITE_DOMAIN}`;
  const context = [
    `-c "alertEmail=${process.env.ALERT_EMAIL}"`,
    `-c reserve=${reserve}`,
    `-c siteUrl=${siteUrl}`,
    `-c origins=${siteUrl},https://${process.env.AMPLIFY_DOMAIN}`,
    process.env.SES_FROM ? `-c sesFrom=${process.env.SES_FROM}` : '',
    process.env.SUPPORT_EMAIL ? `-c replyTo=${process.env.SUPPORT_EMAIL}` : '',
    process.env.API_DOMAIN ? `-c apiDomain=${process.env.API_DOMAIN} -c apiCertificateArn=${process.env.API_CERTIFICATE_ARN}` : '',
  ].filter(Boolean).join(' ');
  run(`npx cdk deploy --profile ${PROFILE} --require-approval never --outputs-file outputs.json ${context}`, { cwd: path.join(ROOT, 'infra') });
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'infra', 'outputs.json'), 'utf8'))[STACK];
  console.log(`\nAPI: ${o.ApiUrl}${o.ApiDomainTarget ? ` (${process.env.API_DOMAIN} CNAME ${o.ApiDomainTarget})` : ''}\nUser pool: ${o.UserPoolId}`);
  console.log('The Amplify app\'s environment variables, should they change: NEXT_PUBLIC_COGNITO_USER_POOL_ID, NEXT_PUBLIC_COGNITO_CLIENT_ID, NEXT_PUBLIC_EVENTS_*');
}
