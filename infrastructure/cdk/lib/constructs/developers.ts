import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface DevelopersProps {
  /** IAM usernames to create and add to the developers group. */
  readonly usernames: string[];
}

/**
 * Creates an IAM group with permissions to run `cdk deploy` (assume CDK bootstrap roles)
 * and IAM users in that group. Access keys are NOT created here (root generates them
 * via console or CLI after deploy).
 */
export class Developers extends Construct {
  public readonly group: iam.Group;
  public readonly users: iam.User[];

  constructor(scope: Construct, id: string, props: DevelopersProps) {
    super(scope, id);

    const account = cdk.Stack.of(this).account;

    this.group = new iam.Group(this, 'Group', {
      groupName: 'hourlybill-developers',
    });

    // Allow assuming CDK bootstrap roles (deploy, lookup, file-publishing, image-publishing)
    this.group.addToPolicy(new iam.PolicyStatement({
      sid: 'AssumeCDKBootstrapRoles',
      effect: iam.Effect.ALLOW,
      actions: ['sts:AssumeRole'],
      resources: [`arn:aws:iam::${account}:role/cdk-*`],
    }));

    // Allow describing stacks (for cdk diff / deploy status)
    this.group.addToPolicy(new iam.PolicyStatement({
      sid: 'DescribeStacks',
      effect: iam.Effect.ALLOW,
      actions: ['cloudformation:DescribeStacks'],
      resources: ['*'],
    }));

    cdk.Tags.of(this.group).add('Application', 'HourlyBill');

    this.users = props.usernames.map((username) => {
      const user = new iam.User(this, `User-${username}`, {
        userName: `hourlybill-${username}`,
      });
      user.addToGroup(this.group);
      cdk.Tags.of(user).add('Application', 'HourlyBill');
      return user;
    });
  }
}
