#!/usr/bin/env node
/**
 * Runs CDK with the Hourly Bill AWS profile and region.
 * Use this so CDK always targets account 873057437151 and never picks up
 * another project's credentials (e.g. from a different AWS_PROFILE in the shell).
 *
 * One-time setup: each developer creates a profile named "hourlybill" in
 * ~/.aws/config and ~/.aws/credentials with their access keys for account 873057437151.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const profile = process.env.HOURLYBILL_AWS_PROFILE || 'hourlybill';
const region = process.env.HOURLYBILL_AWS_REGION || 'us-west-2';

const env = {
  ...process.env,
  AWS_PROFILE: profile,
  AWS_REGION: region,
};

const args = process.argv.slice(2);
const result = spawnSync('npx', ['cdk', ...args], {
  stdio: 'inherit',
  shell: true,
  env,
  cwd: path.resolve(__dirname),
});

process.exit(result.status ?? 1);
