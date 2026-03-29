import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface DataBucketProps {
  readonly account: string;
}

export class DataBucket extends Construct {
  public readonly bucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: DataBucketProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: `hourlybill-data-${props.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    cdk.Tags.of(this.bucket).add('Application', 'HourlyBill');
  }
}
