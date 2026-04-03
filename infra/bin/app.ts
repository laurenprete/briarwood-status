#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BriarwoodStatusStack } from '../lib/status-stack';

const app = new cdk.App();

new BriarwoodStatusStack(app, 'BriarwoodStatusStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});

cdk.Tags.of(app).add('expense-group', 'briarwood');

app.synth();


