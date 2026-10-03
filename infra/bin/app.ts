#!/usr/bin/env node
/**
 * LearnBox Sessions in AWS: one stack, in the owner's account (281627750083, profile `personal`),
 * region ap-south-1. Secrets come from the deploying shell's environment (scripts/deploy.mjs
 * reads them from .env.local) and are never written here or to git.
 *
 * Context (-c): siteUrl (the site's address, for links the server sends out), domain and
 * certificateArn (the custom domain and its certificate in us-east-1, once DNS is set up),
 * alertEmail (where the budget and alarms write).
 */
import * as cdk from 'aws-cdk-lib';
import { SessionsStack } from '../lib/sessions-stack';

const app = new cdk.App();
const ctx = (k: string) => (app.node.tryGetContext(k) as string | undefined) || undefined;

new SessionsStack(app, 'LearnBoxSessions', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'ap-south-1' },
  description: 'LearnBox Sessions: table, user pool, live push, API and the site',
  siteUrl: ctx('siteUrl'),
  domain: ctx('domain'),
  certificateArn: ctx('certificateArn'),
  alertEmail: ctx('alertEmail'),
  sesFrom: ctx('sesFrom'),
  secrets: {
    PAYU_KEY: process.env.PAYU_KEY,
    PAYU_SALT: process.env.PAYU_SALT,
    PAYU_ENV: process.env.PAYU_ENV,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    ORIGIN_SECRET: process.env.ORIGIN_SECRET,
  },
});
