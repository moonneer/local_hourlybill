#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { HourlyBillStack } from '../lib/hourlybill-stack';

const ACCOUNT = '873057437151';
const REGION = 'us-west-2';

const app = new cdk.App();

new HourlyBillStack(app, 'HourlyBillStack', {
  env: { account: ACCOUNT, region: REGION },
  description: 'Hourly Bill v3 - MVP stack',
});
