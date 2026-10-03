# LearnBox Sessions in AWS

One CDK stack, `LearnBoxSessions`, in account 281627750083 (profile `personal`), region ap-south-1. `lib/sessions-stack.ts` says what it makes; this is how it is run.

## Deploy

**The pages**: the Amplify app `learnbox-sessions` (id `d2zcg00mh4iuxh`) is connected to the GitHub repository `tl-tigon/learnbox-sessions` in the Amplify console and builds `amplify.yml` on every push to `main`. Its environment variables are the stack's outputs (`NEXT_PUBLIC_API_URL`, the user pool, the events API); its rewrite proxies `/j/<*>` to `https://api.sessions.learnbox.one/j/<*>`; its platform is `WEB` (static), not `WEB_COMPUTE`. Builds and their logs: `aws amplify list-jobs --app-id d2zcg00mh4iuxh --branch-name main`, then `get-job`.

**The API**, from the repo root, with `.env.local` holding `ALERT_EMAIL`, `SITE_DOMAIN`, `AMPLIFY_DOMAIN`, the PayU keys and `PAYU_ENV`, `ANTHROPIC_API_KEY`, `API_DOMAIN` and `API_CERTIFICATE_ARN`:

```
node scripts/deploy.mjs          # the bundles, then the stack
node scripts/deploy.mjs --code   # the three Lambdas' code alone
```

The outputs land in `infra/outputs.json` (ignored by git). First time only, the account needs CDK's bootstrap: `cd infra && npx cdk bootstrap --profile personal`.

## The custom domains

`learnbox.one` is served by Cloudflare. Every record is DNS only (grey cloud, not proxied): Amplify and API Gateway are already the edge, and a proxied record would put one in front of the other. Set up on 2026-10-03.

**The site, `sessions.learnbox.one`**: added to the Amplify app under Hosting → Custom domains (or `aws amplify create-domain-association`). Amplify issues the certificate and names two CNAMEs: one that proves the domain, and `sessions` to the app's CloudFront name. `SITE_DOMAIN` in `.env.local` tells the stack the site's address (links the server sends, CORS).

**The API, `api.sessions.learnbox.one`** (owner, 2026-10-03: the browser should not be seen calling an execute-api address): an ACM certificate in this region, DNS-validated by a CNAME, then `API_DOMAIN` and `API_CERTIFICATE_ARN` in `.env.local` make the stack add the gateway's custom domain; the output `ApiDomainTarget` is what the `api.sessions` CNAME points at.

Then, in PayU's dashboard, change the account's website to `https://sessions.learnbox.one`.

## The account's Lambda limit

A new account may run 10 Lambda invocations at once in a region, in total: enough to deploy and try the site, far too few for a room of phones. The deploy reads the limit; at 170 or more it reserves each function's concurrency (100 audience, 50 host, 10 billing) as a spending cap, below that it reserves nothing. Raised to 1,000 on 2026-10-03 (`aws service-quotas request-service-quota-increase --service-code lambda --quota-code L-B99A9384 --desired-value 1000`); `aws service-quotas get-service-quota --service-code lambda --quota-code L-B99A9384` shows the current value.

## What costs what

Idle, under a dollar a month: the table and the Lambdas are on demand and inside the free tier; Amplify Hosting bills by build minute (about 4¢ a push), storage and transfer (about 15 GB a month free in the first year, then $0.15 a GB). The budget alert writes to `ALERT_EMAIL` at 80% of $10 (actual) and 100% (forecast). A session of a few hundred phones costs cents.

## Email

Sign-up codes come from `SES_FROM` (no-reply@learnbox.one) through SES, which has production access in ap-south-1. Without `SES_FROM`, Cognito sends them itself: 50 a day.
