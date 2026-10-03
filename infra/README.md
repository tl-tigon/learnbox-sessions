# LearnBox Sessions in AWS

One CDK stack, `LearnBoxSessions`, in account 281627750083 (profile `personal`), region ap-south-1. `lib/sessions-stack.ts` says what it makes; this is how it is run.

## Deploy

From the repo root, with `.env.local` holding `ALERT_EMAIL`, the PayU keys and `PAYU_ENV`, and `ANTHROPIC_API_KEY`:

```
node scripts/deploy.mjs
```

It bundles the API, deploys the stack (twice the first time, so the Lambdas and the API's CORS learn the site's address), builds the pages with the stack's outputs, zips them and hands the zip to Amplify Hosting as a deployment of the branch `main`. No build runs in AWS and nothing is connected to Git. `--stack-only` and `--pages-only` do one half. The outputs land in `infra/outputs.json` (ignored by git). First time only, the account needs CDK's bootstrap: `cd infra && npx cdk bootstrap --profile personal`.

## The custom domains

 is served by Cloudflare. Every record below is DNS only (grey cloud, not proxied): Amplify and API Gateway are already the edge, and a proxied record would put one in front of the other. Set up on 2026-10-03; the records were given to the owner then.

**The site, .** The domain is added to the Amplify app by hand, not by the stack (CloudFormation would sit waiting on the DNS records): . Then  names two CNAMEs: one that proves the domain for Amplify's certificate () and  to the app (). Its  reaches  within an hour of the records being added.  in  makes it the site's address for the stack (links the server sends, CORS).

**The API, ** (owner, 2026-10-03: the browser should not be seen calling an execute-api address). A certificate in this region, , whose validation CNAME () goes into Cloudflare. Once it is ,  and  in  make the stack add the gateway's custom domain, and the output  is what the  CNAME points at. The pages call the name once it resolves (the deploy checks), the gateway's address until then; deploy the pages again after the record is in.

Then, in PayU's dashboard, change the account's website to .

## The account's Lambda limit

A new account may run 10 Lambda invocations at once in a region, in total: enough to deploy and try the site, far too few for a room of phones. The deploy reads the limit; at 170 or more it reserves each function's concurrency (100 audience, 50 host, 10 billing) as a spending cap, below that it reserves nothing. Raise it to 1,000 (requested 2026-10-03, `aws service-quotas request-service-quota-increase --service-code lambda --quota-code L-B99A9384 --desired-value 1000`) and deploy again; `aws service-quotas get-service-quota --service-code lambda --quota-code L-B99A9384` shows the current value.

## What costs what

Idle, under a dollar a month: the table and the Lambdas are on demand and inside the free tier; Amplify Hosting bills by storage and transfer (about 15 GB a month free in the first year, then $0.15 a GB). The budget alert writes to `ALERT_EMAIL` at 80% of $10 (actual) and 100% (forecast). A session of a few hundred phones costs cents.

## Email

Sign-up codes come from `SES_FROM` (no-reply@learnbox.one) through SES, which has production access in ap-south-1. Without `SES_FROM`, Cognito sends them itself: 50 a day.
