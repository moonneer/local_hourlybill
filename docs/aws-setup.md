# AWS Setup – Hourly Bill

Account **873057437151** · Region **us-west-2**

All infrastructure is defined and deployed with **AWS CDK**. IAM developer users and their permissions are also managed in CDK — no manual IAM configuration is needed beyond the initial bootstrap.

The live app runs on **AWS App Runner** (HTTPS). After deploy, use the CloudFormation output **`ServiceUrl`** for the app link. Gmail/Gemini credentials are stored in Secrets Manager and injected into the service for the Python pipeline (`HOURLYBILL_GMAIL_GEMINI_SECRET`).

## How it works

1. The **root user** (or an admin) bootstraps the account once and runs the first `cdk deploy`.
2. That deploy creates IAM users (e.g. `hourlybill-mounir`) inside a `hourlybill-developers` group with permissions to assume CDK bootstrap roles and describe CloudFormation stacks.
3. The root user generates access keys for each CDK-created IAM user.
4. Each developer creates a profile named **`hourlybill`** with those keys. They run `npm run synth` / `npm run deploy` from `infrastructure/cdk`; a script sets the profile automatically so other projects’ AWS env don’t affect this repo.

## First-time setup (root user)

### 1. Install prerequisites

- **AWS CLI** — <https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>
- **Node.js** 18+

### 2. Configure the root profile

```ini
# ~/.aws/config  (Windows: %USERPROFILE%\.aws\config)
[profile hourlybill-root]
region = us-west-2
```

```ini
# ~/.aws/credentials  (Windows: %USERPROFILE%\.aws\credentials)
[hourlybill-root]
aws_access_key_id     = AKIA...
aws_secret_access_key = ...
```

### 3. Bootstrap and deploy

From `infrastructure/cdk`, use the run-cdk script with the root profile:

```bash
cd infrastructure/cdk
npm install

# PowerShell (use root profile for bootstrap and first deploy):
$env:HOURLYBILL_AWS_PROFILE = "hourlybill-root"
node run-cdk.js bootstrap
node run-cdk.js deploy --require-approval never

# Linux / macOS:
export HOURLYBILL_AWS_PROFILE=hourlybill-root
node run-cdk.js bootstrap
node run-cdk.js deploy --require-approval never
```

### 4. Generate access keys for developer users

After the first deploy, IAM users like `hourlybill-mounir` exist. Create access keys for each:

```bash
aws iam create-access-key --user-name hourlybill-mounir --profile hourlybill-root
```

Send the `AccessKeyId` and `SecretAccessKey` to the developer securely.

## Developer setup (after first deploy)

### 1. Create the `hourlybill` profile (one-time)

The CDK scripts expect a profile named **`hourlybill`**. Use the access keys the root user gave you:

```ini
# ~/.aws/config  (Windows: %USERPROFILE%\.aws\config)
[profile hourlybill]
region = us-west-2
```

```ini
# ~/.aws/credentials  (Windows: %USERPROFILE%\.aws\credentials)
[hourlybill]
aws_access_key_id     = AKIA...
aws_secret_access_key = ...
```

### 2. Deploy

You don’t set `AWS_PROFILE` yourself — `npm run synth` and `npm run deploy` use `run-cdk.js`, which sets the profile to `hourlybill` so the right account is always used.

```bash
cd infrastructure/cdk
npm install
npm run synth
npm run deploy
```

If you use a different profile name (e.g. `hourlybill-root`), set `HOURLYBILL_AWS_PROFILE` before running:  
`$env:HOURLYBILL_AWS_PROFILE = "hourlybill-root"` (PowerShell) or `export HOURLYBILL_AWS_PROFILE=hourlybill-root` (Linux/macOS).

## Adding a new developer

1. Open `infrastructure/cdk/lib/hourlybill-stack.ts` and add their name to the `usernames` array in the `Developers` construct:

   ```typescript
   new Developers(this, 'Developers', {
     usernames: ['mounir', 'alice'],
   });
   ```

2. Deploy (`npx cdk deploy`).
3. Root user generates access keys:

   ```bash
   aws iam create-access-key --user-name hourlybill-alice --profile hourlybill-root
   ```

4. Developer creates their local profile and they are ready to go.

## After first deploy

Update the secret `hourlybill/gmail-gemini` in Secrets Manager (via Console or CLI) with real Gmail and Gemini credentials. The placeholder JSON shows the expected keys.
