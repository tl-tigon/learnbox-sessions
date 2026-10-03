#!/usr/bin/env node
/**
 * LearnBox Sessions in AWS: one stack, in the owner's account (281627750083, profile `personal`),
 * region ap-south-1. Secrets come from the deploying shell's environment (scripts/deploy.mjs
 * reads them from .env.local) and are never written here or to git.
 *
 * Context (-c): siteUrl (the site's address, for links the server sends out), domain (the site's custom
 * domain), apiDomain and apiCertificateArn (the API's own name and its issued certificate), origins (the
 * site's addresses, for CORS), alertEmail (where the budget and alarms write), sesFrom, reserve.
 */
import * as cdk from 'aws-cdk-lib';
import { SessionsStack } from '../lib/sessions-stack';

const app = new cdk.App();
const ctx = (k: string) => (app.node.tryGetContext(k) as string | undefined) || undefined;

new SessionsStack(app, 'LearnBoxSessions', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'ap-south-1' },
  description: 'LearnBox Sessions: table, user pool, live push, API and the site',
  siteUrl: ctx('siteUrl'),
  origins: ctx('origins')?.split(','),
  domain: ctx('domain'),
  apiDomain: ctx('apiDomain'),
  apiCertificateArn: ctx('apiCertificateArn'),
  alertEmail: ctx('alertEmail'),
  sesFrom: ctx('sesFrom'),
  companyLine: ctx('companyLine'),
  reserve: ctx('reserve') === 'true',
  secrets: {
    PAYU_KEY: process.env.PAYU_KEY,
    PAYU_SALT: process.env.PAYU_SALT,
    PAYU_ENV: process.env.PAYU_ENV,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  },
});
