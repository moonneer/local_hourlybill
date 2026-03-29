# Hourly Bill – AWS CDK Infrastructure

MVP stack: S3, DynamoDB (auth), Secrets Manager, **AWS App Runner** (container from repo `Dockerfile`), IAM developer users.

Account **873057437151** · Region **us-west-2** (hardcoded in `bin/app.ts`).

**Removed from the stack (vs earlier ECS-based setups):** ECS/Fargate, Application Load Balancer, VPC, NAT gateway, separate pipeline IAM role. The Node app and Python pipeline run in the same App Runner container.

## Structure

One construct per resource area; the stack composes them.

| Construct | File | Purpose |
|-----------|------|---------|
| `DataBucket` | `lib/constructs/data-bucket.ts` | S3 bucket for app data |
| `GmailGeminiSecret` | `lib/constructs/secrets.ts` | Gmail/Gemini secret (Secrets Manager) |
| `BackendRole` | `lib/constructs/roles.ts` | App Runner instance role (S3, DynamoDB, Secrets) |
| `AppRunnerBackend` | `lib/constructs/app-runner-backend.ts` | App Runner service + ECR image asset |
| `Developers` | `lib/constructs/developers.ts` | IAM group + users who can deploy |

## Prerequisites

- Node.js 18+
- **One-time:** Create an AWS CLI profile named **`hourlybill`** in `~/.aws/config` and `~/.aws/credentials` with your access keys for account 873057437151 (see [docs/aws-setup.md](../../docs/aws-setup.md)).

## Deploy

`npm run synth` and `npm run deploy` use `run-cdk.js`, which forces `AWS_PROFILE=hourlybill` and `AWS_REGION=us-west-2`. You don’t set anything in the shell — other projects’ env (e.g. cadabra) won’t affect this repo.

```bash
cd infrastructure/cdk
npm install

# First time only (root user, with their profile)
node run-cdk.js bootstrap
node run-cdk.js deploy --require-approval never

# Then any developer (with profile "hourlybill" configured):
npm run synth
npm run deploy
```

To use a different profile name, set `HOURLYBILL_AWS_PROFILE` (e.g. `hourlybill-root`) before running.

## Backend image (Docker)

The image is **built automatically** during `cdk deploy`. CDK builds from the **repo root** [`Dockerfile`](../../Dockerfile), pushes to the bootstrap asset ECR repository, and points App Runner at that image. The container includes Node, Playwright/Chromium, and Pixi/Python for the Gmail pipeline.

**Requirement:** Docker must be installed and running on the machine where you run `npm run deploy`. On Windows, use [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) and ensure it is running before deploying.

First deploy after migrating from ECS may take several minutes (large image).

## After first deploy

- Stack output **`ServiceUrl`** is the HTTPS URL for the app (replaces the old ALB `BackendUrl` output name).
- Update the secret `hourlybill/gmail-gemini` in Secrets Manager with real Gmail and Gemini credentials. The same JSON is injected at runtime as `HOURLYBILL_GMAIL_GEMINI_SECRET` for the Python pipeline.

## Migrating from an older ECS stack

After a successful App Runner deploy, the old VPC, ALB, ECS service, and NAT gateway are removed from this stack automatically on **`cdk deploy`** (CloudFormation deletes resources that are no longer in the template). Verify in the CloudFormation console that unwanted resources are gone.

## Adding a new developer

See [docs/aws-setup.md](../../docs/aws-setup.md#adding-a-new-developer).
