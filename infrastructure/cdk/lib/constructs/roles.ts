import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface BackendRoleProps {
  readonly dataBucket: s3.IBucket;
  readonly gmailGeminiSecret: ISecret;
  readonly usersTable?: ITable;
  readonly sessionsTable?: ITable;
}

export class BackendRole extends Construct {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: BackendRoleProps) {
    super(scope, id);

    this.role = new iam.Role(this, 'Role', {
      roleName: 'hourlybill-backend-role',
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: 'Runtime role for Hourly Bill App Runner service',
    });
    this.role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
      resources: [props.dataBucket.bucketArn, `${props.dataBucket.bucketArn}/*`],
    }));
    this.role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: [props.gmailGeminiSecret.secretArn],
    }));
    if (props.usersTable) {
      this.role.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:BatchGetItem'],
        resources: [props.usersTable.tableArn, `${props.usersTable.tableArn}/index/*`],
      }));
    }
    if (props.sessionsTable) {
      this.role.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:BatchGetItem'],
        resources: [props.sessionsTable.tableArn],
      }));
    }
    cdk.Tags.of(this.role).add('Application', 'HourlyBill');
  }
}
