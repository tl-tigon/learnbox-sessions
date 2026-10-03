/* Deploys LearnBox Sessions to the owner's AWS account, in order:
     1. the Lambda bundles (scripts/build-lambda.mjs);
     2. the stack (infra/), with the secrets from .env.local in the environment;
     3. the pages, built with the stack's outputs (user pool, events API), uploaded to the site bucket, and the CDN told to forget the old ones.
   Run from the repo root: node scripts/deploy.mjs [--stack-only | --pages-only]
   Reads from .env.local: PAYU_KEY, PAYU_SALT, PAYU_ENV, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ALERT_EMAIL, and optionally
   SITE_DOMAIN with SITE_CERTIFICATE_ARN (the certificate must be in us-east-1), and SES_FROM (e.g. no-reply@learnbox.one) once SES has
   production access. ORIGIN_SECRET is made on first use and kept there.
   AWS_PROFILE defaults to "personal". Nothing here is written to git. */
import { execSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
if (!process.env.ORIGIN_SECRET) {
  process.env.ORIGIN_SECRET = randomBytes(24).toString('base64url');
  fs.appendFileSync(ENV_FILE, `\n# The header the CDN sends to the API; the API answers nobody else. Made by scripts/deploy.mjs.\nORIGIN_SECRET=${process.env.ORIGIN_SECRET}\n`);
  console.log('ORIGIN_SECRET made and kept in .env.local');
}
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
const context = (siteUrl) => [
  `-c alertEmail=${process.env.ALERT_EMAIL}`,
  siteUrl ? `-c siteUrl=${siteUrl}` : '',
  process.env.SES_FROM ? `-c sesFrom=${process.env.SES_FROM}` : '',
  process.env.SITE_DOMAIN ? `-c domain=${process.env.SITE_DOMAIN} -c certificateArn=${process.env.SITE_CERTIFICATE_ARN}` : '',
].filter(Boolean).join(' ');
const outputsFile = path.join(ROOT, 'infra', 'outputs.json');
const outputs = () => JSON.parse(fs.readFileSync(outputsFile, 'utf8')).LearnBoxSessions;
const deployStack = (siteUrl) => run(`npx cdk deploy --profile ${PROFILE} --require-approval never --outputs-file outputs.json ${context(siteUrl)}`, { cwd: path.join(ROOT, 'infra') });

if (mode !== '--pages-only') {
  run('node scripts/build-lambda.mjs');
  /* The site's address is one of the stack's own outputs, so the first deploy does not know it; a second pass sets it. */
  const known = process.env.SITE_DOMAIN ? `https://${process.env.SITE_DOMAIN}` : fs.existsSync(outputsFile) ? outputs().SiteUrl : undefined;
  deployStack(known);
  if (outputs().SiteUrl !== known) deployStack(outputs().SiteUrl);
}

if (mode !== '--stack-only') {
  const o = outputs();
  const pageEnv = {
    ...process.env,
    NEXT_PUBLIC_AUTH_MODE: 'cognito',
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: o.UserPoolId,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: o.UserPoolClientId,
    NEXT_PUBLIC_EVENTS_HTTP_DOMAIN: o.EventsHttpDomain,
    NEXT_PUBLIC_EVENTS_REALTIME_DOMAIN: o.EventsRealtimeDomain,
    NEXT_PUBLIC_EVENTS_API_KEY: o.EventsApiKey,
    NEXT_DIST_DIR: '',
  };
  delete pageEnv.NEXT_DIST_DIR;
  fs.rmSync(path.join(ROOT, 'out'), { recursive: true, force: true });
  run('npx next build', { env: pageEnv });
  run('git checkout tsconfig.json');
  /* Hashed files are immutable; everything else is re-read within a minute. */
  run(`aws s3 sync out/ s3://${o.SiteBucket}/ --delete --exclude "_next/static/*" --cache-control "public, max-age=60" --profile ${PROFILE} --region ${REGION}`);
  run(`aws s3 sync out/ s3://${o.SiteBucket}/ --exclude "*" --include "_next/static/*" --cache-control "public, max-age=31536000, immutable" --profile ${PROFILE} --region ${REGION}`);
  const inv = aws(['cloudfront', 'create-invalidation', '--distribution-id', o.DistributionId, '--paths', '"/*"']);
  console.log(`\nInvalidation ${inv.Invalidation.Id} started.`);
  console.log(`\nSite: ${o.SiteUrl}\nAPI (answers the CDN only): ${o.ApiUrl}\nUser pool: ${o.UserPoolId}`);
}
