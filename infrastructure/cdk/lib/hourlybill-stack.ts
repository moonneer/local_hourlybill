import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { AuthDatabase } from './constructs/auth-database';
import { AppRunnerBackend } from './constructs/app-runner-backend';
import { DataBucket } from './constructs/data-bucket';
import { GmailGeminiSecret } from './constructs/secrets';
import { Developers } from './constructs/developers';
import { BackendRole } from './constructs/roles';

export class HourlyBillStack extends cdk.Stack {
  public readonly dataBucket: s3.IBucket;
  public readonly gmailGeminiSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const account = this.account;

    const dataBucket = new DataBucket(this, 'DataBucket', { account });
    this.dataBucket = dataBucket.bucket;

    const gmailGeminiSecret = new GmailGeminiSecret(this, 'GmailGeminiSecret');
    this.gmailGeminiSecret = gmailGeminiSecret.secret;

    const authDb = new AuthDatabase(this, 'AuthDatabase');

    const backendRole = new BackendRole(this, 'BackendRole', {
      dataBucket: dataBucket.bucket,
      gmailGeminiSecret: gmailGeminiSecret.secret,
      usersTable: authDb.usersTable,
      sessionsTable: authDb.sessionsTable,
    });

    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const appRunner = new AppRunnerBackend(this, 'AppRunnerBackend', {
      dataBucket: dataBucket.bucket,
      backendInstanceRole: backendRole.role,
      gmailGeminiSecret: gmailGeminiSecret.secret,
      dockerContextPath: repoRoot,
      usersTableName: authDb.usersTable.tableName,
      sessionsTableName: authDb.sessionsTable.tableName,
    });

    new Developers(this, 'Developers', {
      usernames: ['mounir', 'moon-test'],
    });

    new cdk.CfnOutput(this, 'DataBucketName', {
      value: dataBucket.bucket.bucketName,
      description: 'S3 bucket for app data (user data under {user_id}/)',
      exportName: 'HourlyBill-DataBucketName',
    });
    new cdk.CfnOutput(this, 'GmailGeminiSecretArn', {
      value: gmailGeminiSecret.secret.secretArn,
      description: 'Secrets Manager ARN for Gmail/Gemini credentials',
      exportName: 'HourlyBill-GmailGeminiSecretArn',
    });
    new cdk.CfnOutput(this, 'ServiceUrl', {
      value: appRunner.service.attrServiceUrl,
      description: 'App Runner service URL (HTTPS; backend + static app)',
      exportName: 'HourlyBill-ServiceUrl',
    });
    new cdk.CfnOutput(this, 'BackendImageUri', {
      value: appRunner.imageUri,
      description: 'Backend image URI (built on cdk deploy)',
      exportName: 'HourlyBill-BackendImageUri',
    });
    new cdk.CfnOutput(this, 'UsersTableName', {
      value: authDb.usersTable.tableName,
      description: 'DynamoDB table for auth users',
      exportName: 'HourlyBill-UsersTableName',
    });
    new cdk.CfnOutput(this, 'SessionsTableName', {
      value: authDb.sessionsTable.tableName,
      description: 'DynamoDB table for auth sessions',
      exportName: 'HourlyBill-SessionsTableName',
    });
  }
}
