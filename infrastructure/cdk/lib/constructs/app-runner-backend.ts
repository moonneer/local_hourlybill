import * as cdk from 'aws-cdk-lib';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface AppRunnerBackendProps {
  readonly dataBucket: s3.IBucket;
  /** Runtime role: S3, DynamoDB, Secrets Manager (for app + injected env secrets). */
  readonly backendInstanceRole: iam.IRole;
  readonly gmailGeminiSecret: secretsmanager.ISecret;
  /** Repo root (contains Dockerfile). */
  readonly dockerContextPath: string;
  readonly usersTableName?: string;
  readonly sessionsTableName?: string;
}


export class AppRunnerBackend extends Construct {
  public readonly service: apprunner.CfnService;
  public readonly imageUri: string;

  constructor(scope: Construct, id: string, props: AppRunnerBackendProps) {
    super(scope, id);

    const asset = new ecr_assets.DockerImageAsset(this, 'BackendImage', {
      directory: props.dockerContextPath,
    });
    this.imageUri = asset.imageUri;

    const accessRole = new iam.Role(this, 'AppRunnerEcrAccess', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppRunnerServicePolicyForECRAccess'),
      ],
    });
    asset.repository.grantPull(accessRole);

    const region = cdk.Stack.of(this).region;

    const runtimeEnvironmentVariables: apprunner.CfnService.KeyValuePairProperty[] = [
      { name: 'NODE_ENV', value: 'development' },
      { name: 'PORT', value: '8080' },
      { name: 'S3_BUCKET', value: props.dataBucket.bucketName },
      { name: 'AWS_REGION', value: region },
    ];
    if (props.usersTableName) {
      runtimeEnvironmentVariables.push({ name: 'USERS_TABLE', value: props.usersTableName });
    }
    if (props.sessionsTableName) {
      runtimeEnvironmentVariables.push({ name: 'SESSIONS_TABLE', value: props.sessionsTableName });
    }

    /** Full JSON secret string for Python pipeline (same keys as .env). */
    const runtimeEnvironmentSecrets: apprunner.CfnService.KeyValuePairProperty[] = [
      { name: 'HOURLYBILL_GMAIL_GEMINI_SECRET', value: props.gmailGeminiSecret.secretArn },
    ];

    this.service = new apprunner.CfnService(this, 'Service', {
      serviceName: 'hourlybill-backend',
      sourceConfiguration: {
        autoDeploymentsEnabled: true,
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: asset.imageUri,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '8080',
            runtimeEnvironmentVariables,
            runtimeEnvironmentSecrets,
          },
        },
      },
      instanceConfiguration: {
        cpu: '4096',
        memory: '8192',
        instanceRoleArn: props.backendInstanceRole.roleArn,
      },
      healthCheckConfiguration: {
        path: '/login.html',
        protocol: 'HTTP',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      tags: [{ key: 'Application', value: 'HourlyBill' }],
    });
  }
}
