import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';

export class BriarwoodStatusStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── DynamoDB Tables ───────────────────────────────────────────────

    const monitorsTable = new dynamodb.Table(this, 'MonitorsTable', {
      tableName: 'briarwood-status-monitors',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const checkResultsTable = new dynamodb.Table(this, 'CheckResultsTable', {
      tableName: 'briarwood-status-check-results',
      partitionKey: { name: 'monitorId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const monitorStateTable = new dynamodb.Table(this, 'MonitorStateTable', {
      tableName: 'briarwood-status-monitor-state',
      partitionKey: { name: 'monitorId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const groupsTable = new dynamodb.Table(this, 'GroupsTable', {
      tableName: 'briarwood-status-groups',
      partitionKey: { name: 'slug', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ─── Secrets (Secrets Manager) ──────────────────────────────────────

    const smtp2goSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'Smtp2goSecret',
      'briarwood/smtp2go-api-key',
    );

    const healthCheckToken = secretsmanager.Secret.fromSecretNameV2(
      this,
      'HealthCheckToken',
      'briarwood/health-check-token',
    );

    const logoBucket = new cdk.aws_s3.Bucket(this, 'LogoBucket', {
      bucketName: 'briarwood-status-logos',
      publicReadAccess: true,
      blockPublicAccess: new cdk.aws_s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      cors: [{
        allowedMethods: [cdk.aws_s3.HttpMethods.PUT],
        allowedOrigins: ['https://status.briarwoodsoftware.com'],
        allowedHeaders: ['*'],
      }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ─── Lambda Functions ──────────────────────────────────────────────

    const checkerFn = new lambda.Function(this, 'CheckerLambda', {
      functionName: 'briarwood-status-checker',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/checker')),
      environment: {
        MONITORS_TABLE: monitorsTable.tableName,
        CHECK_RESULTS_TABLE: checkResultsTable.tableName,
        MONITOR_STATE_TABLE: monitorStateTable.tableName,
        SMTP2GO_API_KEY: smtp2goSecret.secretValue.unsafeUnwrap(),
        HEALTH_CHECK_TOKEN: healthCheckToken.secretValue.unsafeUnwrap(),
      },
    });

    const apiFn = new lambda.Function(this, 'ApiLambda', {
      functionName: 'briarwood-status-api',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/api')),
      environment: {
        MONITORS_TABLE: monitorsTable.tableName,
        CHECK_RESULTS_TABLE: checkResultsTable.tableName,
        MONITOR_STATE_TABLE: monitorStateTable.tableName,
        COGNITO_USER_POOL_ID: 'us-east-1_UoxtyhxH5',
        COGNITO_CLIENT_ID: '40bcm1gp95r5sr3aes9qa3c4q4',
        COGNITO_REGION: 'us-east-1',
        HEALTH_CHECK_TOKEN: healthCheckToken.secretValue.unsafeUnwrap(),
        GROUPS_TABLE: groupsTable.tableName,
        LOGO_BUCKET: logoBucket.bucketName,
      },
    });

    // Grant DynamoDB read/write to both Lambdas
    monitorsTable.grantReadWriteData(checkerFn);
    checkResultsTable.grantReadWriteData(checkerFn);
    monitorStateTable.grantReadWriteData(checkerFn);

    monitorsTable.grantReadWriteData(apiFn);
    checkResultsTable.grantReadWriteData(apiFn);
    monitorStateTable.grantReadWriteData(apiFn);
    groupsTable.grantReadWriteData(apiFn);
    logoBucket.grantReadWrite(apiFn);

    // ─── EventBridge Schedule ──────────────────────────────────────────

    const scheduleRule = new events.Rule(this, 'CheckScheduleRule', {
      ruleName: 'briarwood-status-check-schedule',
      schedule: events.Schedule.rate(cdk.Duration.minutes(2)),
    });
    scheduleRule.addTarget(new eventsTargets.LambdaFunction(checkerFn));

    // ─── API Lambda Alias with Provisioned Concurrency ──────────────────

    const apiAlias = new lambda.Alias(this, 'ApiLambdaLiveAlias', {
      aliasName: 'live',
      version: apiFn.currentVersion,
      provisionedConcurrentExecutions: 1,
    });
    cdk.Tags.of(apiFn).add('expense-group', 'briarwood');

    // ─── HTTP API Gateway ──────────────────────────────────────────────

    const apiIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'ApiLambdaIntegration',
      apiAlias,
    );

    const httpApi = new apigwv2.HttpApi(this, 'StatusHttpApi', {
      apiName: 'briarwood-status-api-gw',
      defaultIntegration: apiIntegration,
      corsPreflight: {
        allowOrigins: ['https://status.briarwoodsoftware.com', 'https://status-api.briarwoodsoftware.com'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.hours(24),
      },
    });

    // ─── Custom Domain for API Gateway ──────────────────────────────────

    const hostedZone = route53.HostedZone.fromLookup(this, 'BriarwoodZone', {
      domainName: 'briarwoodsoftware.com',
    });

    const apiCert = new acm.Certificate(this, 'ApiCertificate', {
      domainName: 'status-api.briarwoodsoftware.com',
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    const apiDomainName = new apigwv2.DomainName(this, 'ApiDomainName', {
      domainName: 'status-api.briarwoodsoftware.com',
      certificate: apiCert,
    });

    new apigwv2.ApiMapping(this, 'ApiMapping', {
      api: httpApi,
      domainName: apiDomainName,
    });

    new route53.ARecord(this, 'ApiAliasRecord', {
      zone: hostedZone,
      recordName: 'status-api',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          apiDomainName.regionalDomainName,
          apiDomainName.regionalHostedZoneId,
        ),
      ),
    });

    // ─── Amplify Hosting (Frontend) ────────────────────────────────────

    const amplifyApp = new amplify.CfnApp(this, 'AmplifyApp', {
      name: 'briarwood-status',
      platform: 'WEB',
      customRules: [
        {
          // Proxy API requests to API Gateway (must come before SPA catch-all)
          source: '/api/<*>',
          target: `https://status-api.briarwoodsoftware.com/api/<*>`,
          status: '200',
        },
        {
          // SPA catch-all: serve index.html for any path that isn't a static file
          source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>',
          target: '/index.html',
          status: '200',
        },
      ],
      environmentVariables: [
        {
          name: 'VITE_API_URL',
          value: `https://status-api.briarwoodsoftware.com/api`,
        },
        {
          name: 'VITE_COGNITO_CLIENT_ID',
          value: '40bcm1gp95r5sr3aes9qa3c4q4',
        },
        {
          name: 'VITE_COGNITO_REGION',
          value: 'us-east-1',
        },
      ],
      // Build spec
      buildSpec: [
        'version: 1',
        'applications:',
        '  - appRoot: frontend',
        '    frontend:',
        '      phases:',
        '        preBuild:',
        '          commands:',
        '            - npm ci',
        '        build:',
        '          commands:',
        '            - npm run build',
        '      artifacts:',
        '        baseDirectory: dist',
        '        files:',
        '          - "**/*"',
        '      cache:',
        '        paths:',
        '          - node_modules/**/*',
      ].join('\n'),
    });

    const amplifyBranch = new amplify.CfnBranch(this, 'AmplifyBranch', {
      appId: amplifyApp.attrAppId,
      branchName: 'main',
      enableAutoBuild: true,
      stage: 'PRODUCTION',
      environmentVariables: [
        {
          name: 'VITE_API_URL',
          value: `https://status-api.briarwoodsoftware.com/api`,
        },
        {
          name: 'VITE_COGNITO_CLIENT_ID',
          value: '40bcm1gp95r5sr3aes9qa3c4q4',
        },
        {
          name: 'VITE_COGNITO_REGION',
          value: 'us-east-1',
        },
      ],
    });

    const amplifyDomain = new amplify.CfnDomain(this, 'AmplifyDomain', {
      appId: amplifyApp.attrAppId,
      domainName: 'briarwoodsoftware.com',
      subDomainSettings: [
        {
          branchName: amplifyBranch.branchName,
          prefix: 'status',
        },
      ],
    });
    amplifyDomain.addDependency(amplifyBranch);

    // ─── Outputs ───────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
    });

    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: amplifyApp.attrAppId,
    });

    new cdk.CfnOutput(this, 'AmplifyDefaultDomain', {
      value: amplifyApp.attrDefaultDomain,
    });

    new cdk.CfnOutput(this, 'MonitorsTableName', {
      value: monitorsTable.tableName,
    });

    new cdk.CfnOutput(this, 'CheckResultsTableName', {
      value: checkResultsTable.tableName,
    });

    new cdk.CfnOutput(this, 'MonitorStateTableName', {
      value: monitorStateTable.tableName,
    });

    new cdk.CfnOutput(this, 'GroupsTableName', {
      value: groupsTable.tableName,
    });

    new cdk.CfnOutput(this, 'LogoBucketName', {
      value: logoBucket.bucketName,
    });
  }
}
