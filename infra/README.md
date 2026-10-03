# LearnBox Sessions in AWS

One CDK stack, `LearnBoxSessions`, in account 281627750083 (profile `personal`), region ap-south-1. `lib/sessions-stack.ts` says what it makes; this is how it is run.

## Deploy

From the repo root, with `.env.local` holding `ALERT_EMAIL`, the PayU keys and `PAYU_ENV`, and `ANTHROPIC_API_KEY`:

```
node scripts/deploy.mjs
```

It bundles the API, deploys the stack (twice the first time, so the Lambdas learn the site's address), builds the pages with the stack's outputs, uploads them and invalidates the CDN. `--stack-only` and `--pages-only` do one half. The outputs land in `infra/outputs.json` (ignored by git). First time only, the account needs CDK's bootstrap: `cd infra && npx cdk bootstrap --profile personal`.

## The custom domain

`learnbox.one` is served by Cloudflare. For `sessions.learnbox.one`:

1. Make a certificate in us-east-1 (CloudFront reads certificates there and nowhere else): `aws acm request-certificate --domain-name sessions.learnbox.one --validation-method DNS --region us-east-1 --profile personal`, then `aws acm describe-certificate` for the CNAME it wants.
2. In Cloudflare, add that validation CNAME (DNS only, not proxied). The certificate is issued within minutes.
3. Put `SITE_DOMAIN=sessions.learnbox.one` and `SITE_CERTIFICATE_ARN=arn:aws:acm:us-east-1:...` in `.env.local` and deploy again.
4. In Cloudflare, add `sessions` as a CNAME to the distribution's domain (`DistributionDomain` in the outputs), DNS only, not proxied: CloudFront is already the CDN, and a proxied record would put one in front of the other.
5. In PayU's dashboard, change the account's website to `https://sessions.learnbox.one`.

## What costs what

Idle, under a dollar a month: the table and the Lambdas are on demand and inside the free tier, CloudFront's first terabyte is free. The budget alert writes to `ALERT_EMAIL` at 80% of $10 (actual) and 100% (forecast). A session of a few hundred phones costs cents.

## Email

Cognito sends the sign-up codes itself: 50 a day. For more, verify `learnbox.one` in SES in ap-south-1 (it is already verified there), ask AWS for production access, and switch the pool to `UserPoolEmail.withSES`.
