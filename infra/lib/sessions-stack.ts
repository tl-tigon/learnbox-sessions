/**
 * Everything LearnBox Sessions runs on, as one stack:
 * - a DynamoDB table (on demand; rows carry their own expiry);
 * - a Cognito user pool for facilitators (email and password, with an emailed code);
 * - an AppSync Events API for the live push (the server publishes with its role, browsers subscribe with the API key);
 * - three Lambdas, one per route group (audience, host, billing), from `dist/lambda/`, behind an HTTP API whose
 *   routes come from `dist/lambda/routes.json`, throttled, each with a cap on how many may run at once;
 * - (the pages are an Amplify Hosting app connected to GitHub in the console, outside this stack; browsers call the API at
 *   its own name, api.sessions.learnbox.one, and CORS names the site);
 * - alarms on errors, and a monthly budget alert.
 *
 * No managed compute for pages (owner's decision, 2026-10-03): nothing runs when a page is opened. Amplify Hosting for them
 * (owner's decision, 2026-10-03), with the domain and certificate handled there.
 */
import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SessionsStackProps extends cdk.StackProps {
  /** The site's own address (https://...), where the server sends a buyer back after paying. Known after the first deploy (the Amplify app's domain), or the custom domain. */
  siteUrl?: string;
  /** The addresses pages are served from (the Amplify domain, and the custom domain once set), for CORS. Unknown on the first deploy: then any origin, until the second pass. */
  origins?: string[];
  /** The site's custom domain (sessions.learnbox.one), added to the Amplify app by hand (infra/README.md); here it names the site's address. */
  domain?: string;
  /** The API's own domain (api.sessions.learnbox.one) and its certificate in this region, issued before the deploy. Both or neither. */
  apiDomain?: string;
  apiCertificateArn?: string;
  /** Where the budget and the alarms write: one address, or several separated by commas. */
  alertEmail?: string;
  /** The address sign-up codes come from, once SES has production access (e.g. no-reply@learnbox.one). Unset, Cognito's own sender is used: 50 a day. */
  sesFrom?: string;
  /** The company line at the foot of the code email (legal name, city, support address). Left out until the owner gives it. */
  companyLine?: string;
  /** Reserve each function's concurrency (its spending cap). Needs the account's Lambda limit to be at least 170. */
  reserve?: boolean;
  /** Read from the deploying shell's environment; never written to git. */
  secrets: { PAYU_KEY?: string; PAYU_SALT?: string; PAYU_ENV?: string; ANTHROPIC_API_KEY?: string; ANTHROPIC_MODEL?: string };
}

type Group = 'audience' | 'host' | 'billing';
interface RouteEntry { path: string; methods: string[]; group: Group }

const DIST = path.resolve(__dirname, '..', '..', 'dist', 'lambda');

/** The code email, with the company line in its footer (or that line left out). Cognito fills {####}. */
const codeEmail = (companyLine?: string) =>
  fs.readFileSync(path.join(__dirname, 'email-code.html'), 'utf8').replace(/\s*\{\{COMPANY\}\}/, companyLine ? `\n  ${companyLine.replace(/&/g, '&amp;').replace(/</g, '&lt;')}` : '').replace(/\r?\n\s*/g, '\n');

export class SessionsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SessionsStackProps) {
    super(scope, id, props);

    /* ---- Data ---- */
    const table = new dynamodb.Table(this, 'Table', {
      tableName: 'LearnBoxSessions',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    /* ---- Facilitators' sign-in ---- */
    const pool = new cognito.UserPool(this, 'Users', {
      userPoolName: 'LearnBoxSessions',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      passwordPolicy: { minLength: 8, requireLowercase: false, requireUppercase: false, requireDigits: false, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      /* Cognito's own sender until SES leaves its sandbox (50 emails a day); then the domain's own address. */
      email: props.sesFrom
        ? cognito.UserPoolEmail.withSES({ fromEmail: props.sesFrom, fromName: 'LearnBox Sessions', sesRegion: this.region, sesVerifiedDomain: props.sesFrom.split('@')[1] })
        : cognito.UserPoolEmail.withCognito(),
      /* The branded code email (email-code.html): the mark from the site, the code large, the company line from .env.local. The same
         template carries the sign-up and the forgotten-password code. */
      userVerification: { emailSubject: 'Your LearnBox Sessions code', emailBody: codeEmail(props.companyLine), emailStyle: cognito.VerificationEmailStyle.CODE },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const client = pool.addClient('Web', {
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    /* ---- Live push ---- */
    const events = new appsync.EventApi(this, 'Events', {
      apiName: 'LearnBoxSessions',
      authorizationConfig: {
        authProviders: [{ authorizationType: appsync.AppSyncAuthorizationType.API_KEY }, { authorizationType: appsync.AppSyncAuthorizationType.IAM }],
        connectionAuthModeTypes: [appsync.AppSyncAuthorizationType.API_KEY, appsync.AppSyncAuthorizationType.IAM],
        defaultPublishAuthModeTypes: [appsync.AppSyncAuthorizationType.IAM],
        defaultSubscribeAuthModeTypes: [appsync.AppSyncAuthorizationType.API_KEY],
      },
    });
    events.addChannelNamespace('live');

    /* ---- The API: one Lambda per group ---- */
    const routes = JSON.parse(fs.readFileSync(path.join(DIST, 'routes.json'), 'utf8')) as RouteEntry[];
    const env: Record<string, string> = {
      NODE_ENV: 'production',
      STORE: 'dynamo',
      DYNAMODB_TABLE_NAME: table.tableName,
      AUTH_MODE: 'cognito',
      NEXT_PUBLIC_COGNITO_USER_POOL_ID: pool.userPoolId,
      NEXT_PUBLIC_COGNITO_CLIENT_ID: client.userPoolClientId,
      NEXT_PUBLIC_EVENTS_HTTP_DOMAIN: events.httpDns,
      ...(props.siteUrl ? { SITE_URL: props.siteUrl } : {}),
    };
    /* What each group needs: the audience's Lambda never holds a secret; the host's holds the model's key; the billing one the gateway's. */
    const extra: Record<Group, Record<string, string | undefined>> = {
      audience: {},
      host: { ANTHROPIC_API_KEY: props.secrets.ANTHROPIC_API_KEY, ANTHROPIC_MODEL: props.secrets.ANTHROPIC_MODEL },
      billing: { PAYU_KEY: props.secrets.PAYU_KEY, PAYU_SALT: props.secrets.PAYU_SALT, PAYU_ENV: props.secrets.PAYU_ENV },
    };
    const sizing: Record<Group, { memory: number; timeout: number; concurrency: number }> = {
      audience: { memory: 512, timeout: 10, concurrency: 100 },
      host: { memory: 1024, timeout: 30, concurrency: 50 },
      billing: { memory: 512, timeout: 30, concurrency: 10 },
    };
    const fns = {} as Record<Group, lambda.Function>;
    for (const group of ['audience', 'host', 'billing'] as Group[]) {
      const fn = new lambda.Function(this, `Api${group[0].toUpperCase()}${group.slice(1)}`, {
        functionName: `LearnBoxSessions-${group}`,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        handler: `${group}.handler`,
        code: lambda.Code.fromAsset(DIST, { exclude: ['*', `!${group}.js`] }),
        memorySize: sizing[group].memory,
        timeout: cdk.Duration.seconds(sizing[group].timeout),
        /* A cap on each function's spend. Only when the account's own Lambda limit has room for them (a new account's is 10 in total):
           deploy.mjs reads the limit and passes reserve=true. */
        reservedConcurrentExecutions: props.reserve ? sizing[group].concurrency : undefined,
        environment: { ...env, ...Object.fromEntries(Object.entries(extra[group]).filter(([, v]) => v)) as Record<string, string> },
        logGroup: new logs.LogGroup(this, `Logs-${group}`, { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: cdk.RemovalPolicy.DESTROY }),
      });
      table.grantReadWriteData(fn);
      fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['appsync:EventPublish'], resources: [`${events.apiArn}/*`] }));
      fns[group] = fn;
    }

    /* Browsers call the API from the site's own address. CORS says whose pages may read the answers; what protects the API is its
       tokens (a facilitator's Bearer token, a phone's audience token), never the origin. */
    const api = new apigw.HttpApi(this, 'Http', {
      apiName: 'LearnBoxSessions',
      createDefaultStage: true,
      corsPreflight: {
        allowOrigins: props.origins?.length ? props.origins : ['*'],
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST, apigw.CorsHttpMethod.PUT, apigw.CorsHttpMethod.PATCH, apigw.CorsHttpMethod.DELETE],
        allowHeaders: ['authorization', 'content-type', 'x-display-key'],
        maxAge: cdk.Duration.hours(1),
      },
    });
    const stage = api.defaultStage!.node.defaultChild as apigw.CfnStage;
    for (const r of routes) {
      const made = api.addRoutes({
        path: r.path,
        methods: r.methods.map((m) => apigw.HttpMethod[m as keyof typeof apigw.HttpMethod]),
        integration: new HttpLambdaIntegration(`${r.group}-${r.path.replace(/[^a-z0-9]+/gi, '-')}`, fns[r.group]),
      });
      /* The stage names the billing routes in its settings, so it must be made after them. */
      if (r.group === 'billing') for (const route of made) stage.node.addDependency(route);
    }
    /* Throttling: a whole room answers in the same second, so the default is generous; billing is a trickle. */
    stage.defaultRouteSettings = { throttlingRateLimit: 500, throttlingBurstLimit: 1000 };
    /* routeSettings is a raw map (CloudFormation's own casing), unlike defaultRouteSettings. */
    stage.routeSettings = Object.fromEntries(routes.filter((r) => r.group === 'billing').flatMap((r) => r.methods.map((m) => [`${m} ${r.path}`, { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 }])));

    /* ---- The site ---- */
    /* The pages are served by Amplify Hosting (owner's decision, 2026-10-03), as an app connected to the GitHub repository in the
       Amplify console, built from amplify.yml on every push to main. It is not part of this stack: its environment variables are the
       outputs below, its rewrite proxies /j/<code> to the API, and its custom domain is set in the console. The browser calls the API
       at the API's own name. */

    /* The API's own name, so the browser is not seen calling an execute-api address (owner, 2026-10-03). */
    let apiTarget: string | undefined;
    if (props.apiDomain) {
      if (!props.apiCertificateArn) throw new Error('apiDomain needs apiCertificateArn');
      const dn = new apigw.DomainName(this, 'ApiDomain', { domainName: props.apiDomain, certificate: acm.Certificate.fromCertificateArn(this, 'ApiCert', props.apiCertificateArn) });
      new apigw.ApiMapping(this, 'ApiMapping', { api, domainName: dn });
      apiTarget = dn.regionalDomainName;
    }

    /* ---- Watching it ---- */
    const alerts = new sns.Topic(this, 'Alerts', { displayName: 'LearnBox Sessions alerts' });
    const emails = (props.alertEmail ?? '').split(',').map((e) => e.trim()).filter(Boolean);
    if (emails.length) {
      for (const e of emails) alerts.addSubscription(new subs.EmailSubscription(e));
      const subscribers = emails.map((address) => ({ subscriptionType: 'EMAIL', address }));
      new budgets.CfnBudget(this, 'Budget', {
        budget: { budgetName: 'LearnBoxSessions', budgetType: 'COST', timeUnit: 'MONTHLY', budgetLimit: { amount: 10, unit: 'USD' } },
        notificationsWithSubscribers: [
          { notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 80 }, subscribers },
          { notification: { notificationType: 'FORECASTED', comparisonOperator: 'GREATER_THAN', threshold: 100 }, subscribers },
        ],
      });
    }
    for (const [group, fn] of Object.entries(fns)) {
      new cw.Alarm(this, `Errors-${group}`, {
        alarmDescription: `LearnBox Sessions: the ${group} API is failing`,
        metric: fn.metricErrors({ period: cdk.Duration.minutes(5), statistic: 'Sum' }),
        threshold: 5,
        evaluationPeriods: 1,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cwActions.SnsAction(alerts));
    }
    new cw.Alarm(this, 'Throttled', {
      alarmDescription: 'LearnBox Sessions: the API is throttling callers',
      metric: new cw.Metric({ namespace: 'AWS/ApiGateway', metricName: '4xx', dimensionsMap: { ApiId: api.apiId }, period: cdk.Duration.minutes(5), statistic: 'Sum' }),
      threshold: 500,
      evaluationPeriods: 1,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cwActions.SnsAction(alerts));

    /* ---- What the page build and the deploy script need ---- */
    new cdk.CfnOutput(this, 'SiteUrl', { value: props.siteUrl ?? '' });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    /* What the DNS record for the API's own name points at, once the domain is in. */
    new cdk.CfnOutput(this, 'ApiDomainTarget', { value: apiTarget ?? '' });
    new cdk.CfnOutput(this, 'UserPoolId', { value: pool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new cdk.CfnOutput(this, 'EventsHttpDomain', { value: events.httpDns });
    new cdk.CfnOutput(this, 'EventsRealtimeDomain', { value: events.realtimeDns });
    new cdk.CfnOutput(this, 'EventsApiKey', { value: events.apiKeys['Default'].attrApiKey });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
  }
}
