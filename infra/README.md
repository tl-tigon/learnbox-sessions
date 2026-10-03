# LearnBox Sessions in AWS

One CDK stack, `LearnBoxSessions`, in account 281627750083 (profile `personal`), region ap-south-1. `lib/sessions-stack.ts` says what it makes; this is how it is run.

## Deploy

From the repo root, with `.env.local` holding `ALERT_EMAIL`, the PayU keys and `PAYU_ENV`, and `ANTHROPIC_API_KEY`:

```
node scripts/deploy.mjs
```

It bundles the API, deploys the stack (twice the first time, so the Lambdas and the API's CORS learn the site's address), builds the pages with the stack's outputs, zips them and hands the zip to Amplify Hosting as a deployment of the branch `main`. No build runs in AWS and nothing is connected to Git. `--stack-only` and `--pages-only` do one half. The outputs land in `infra/outputs.json` (ignored by git). First time only, the account needs CDK's bootstrap: `cd infra && npx cdk bootstrap --profile personal`.

## The custom domain

`learnbox.one` is served by Cloudflare. For `sessions.learnbox.one`:

1. Put `SITE_DOMAIN=sessions.learnbox.one` in `.env.local` and deploy. The stack adds the domain to the Amplify app, which issues the certificate itself.
2. `aws amplify get-domain-association --app-id <AmplifyAppId> --domain-name learnbox.one --profile personal --region ap-south-1` shows two records to add in Cloudflare, both DNS only (not proxied): a CNAME that proves the domain (`certificateVerificationDNSRecord`) and the `sessions` CNAME to the app (`subDomains[].dnsRecord`). Amplify is already the CDN; a proxied record would put one in front of the other.
3. The domain's status in that output goes to `AVAILABLE` within an hour of the records being added.
4. In PayU's dashboard, change the account's website to `https://sessions.learnbox.one`.

## The account's Lambda limit

A new account may run 10 Lambda invocations at once in a region, in total: enough to deploy and try the site, far too few for a room of phones. The deploy reads the limit; at 170 or more it reserves each function's concurrency (100 audience, 50 host, 10 billing) as a spending cap, below that it reserves nothing. Raise it to 1,000 (requested 2026-10-03, `aws service-quotas request-service-quota-increase --service-code lambda --quota-code L-B99A9384 --desired-value 1000`) and deploy again; `aws service-quotas get-service-quota --service-code lambda --quota-code L-B99A9384` shows the current value.

## What costs what

Idle, under a dollar a month: the table and the Lambdas are on demand and inside the free tier; Amplify Hosting bills by storage and transfer (about 15 GB a month free in the first year, then $0.15 a GB). The budget alert writes to `ALERT_EMAIL` at 80% of $10 (actual) and 100% (forecast). A session of a few hundred phones costs cents.

## Email

Sign-up codes come from `SES_FROM` (no-reply@learnbox.one) through SES, which has production access in ap-south-1. Without `SES_FROM`, Cognito sends them itself: 50 a day.
