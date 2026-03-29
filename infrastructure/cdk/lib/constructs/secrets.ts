import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class GmailGeminiSecret extends Construct {
  public readonly secret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.secret = new secretsmanager.Secret(this, 'Secret', {
      secretName: 'hourlybill/gmail-gemini',
      description: 'Gmail API and Google Gemini API credentials for Hourly Bill pipeline',
      secretStringValue: cdk.SecretValue.unsafePlainText(JSON.stringify({
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        GOOGLE_REFRESH_TOKEN: '',
        GOOGLE_ACCESS_TOKEN: '',
        GOOGLE_TOKEN_EXPIRES_AT: '',
        GOOGLE_GENAI_API_KEY: '',
      }, null, 2)),
    });
    cdk.Tags.of(this.secret).add('Application', 'HourlyBill');
  }
}
