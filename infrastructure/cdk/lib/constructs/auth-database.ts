import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class AuthDatabase extends Construct {
  public readonly usersTable: dynamodb.ITable;
  public readonly sessionsTable: dynamodb.ITable;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'hourlybill-users',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    usersTable.addGlobalSecondaryIndex({
      indexName: 'by-email',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      tableName: 'hourlybill-sessions',
      partitionKey: { name: 'sessionToken', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'expiresAt',
    });

    this.usersTable = usersTable;
    this.sessionsTable = sessionsTable;
    cdk.Tags.of(usersTable).add('Application', 'HourlyBill');
    cdk.Tags.of(sessionsTable).add('Application', 'HourlyBill');
  }
}
