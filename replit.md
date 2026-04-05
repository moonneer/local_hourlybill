# Hourly Bill V3

## Overview
A legal billing SaaS app for law firms. Manages time entries, matters (clients/queries), and generates professional PDF invoices. Now includes a Stripe subscription paywall for PDF export.

## Architecture
- **Backend**: Node.js/TypeScript HTTP server (`backend/src/server.ts`) compiled to `backend/dist/`
- **Frontend**: React + Vite SPA (`frontend/src/`)
- **Database**: AWS DynamoDB (users + sessions tables)
- **Storage**: AWS S3 (per-user file storage for queries, time entries, etc.)
- **Auth**: Session cookie (7 days), bcrypt password hashing
- **Payments**: Stripe subscriptions ($100/month)

## Dev Workflow
```
PORT=5001 NODE_ENV=development node backend/dist/server.js  # backend on :5001
npm --prefix frontend run dev                               # frontend on :5000
```
Backend must be compiled before running: `npm run build:backend`

## Key Files
- `backend/src/server.ts` — HTTP server entrypoint
- `backend/src/routes/api.ts` — All API route handlers
- `backend/src/services/auth.ts` — User/session management (DynamoDB)
- `backend/src/services/stripe.ts` — Stripe checkout, portal, webhook helpers
- `backend/src/services/queries.ts` — Matter/query management (S3)
- `backend/src/services/inputs.ts` — Firm info persistence (S3)
- `frontend/src/App.tsx` — Root component, routing, profile menu
- `frontend/src/pages/subscription.tsx` — Subscription management page
- `frontend/src/pages/pdf-generator.tsx` — Invoice preview + export (paywalled)
- `frontend/src/components/subscribe-modal.tsx` — Paywall modal
- `frontend/src/hooks/use-auth.ts` — useCurrentUser hook (includes subscription)

## Environment Variables Required
These should be injected at startup from AWS Secrets Manager:

| Variable | Description |
|---|---|
| `USERS_TABLE` | DynamoDB users table name |
| `SESSIONS_TABLE` | DynamoDB sessions table name |
| `AWS_REGION` | AWS region (default: us-west-2) |
| `STRIPE_SECRET_KEY` | Stripe secret key (sk_live_... or sk_test_...) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (whsec_...) |
| `STRIPE_PRICE_ID` | Stripe Price ID for the $100/month plan |
| `APP_PUBLIC_URL` | Public HTTPS URL of the app (no trailing slash) |

## Stripe Setup (AWS Secrets Manager)
Store `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in a Secrets Manager secret (e.g. `hourlybill/stripe`). Inject into the App Runner task at startup using the existing secrets loading pattern. Set `STRIPE_PRICE_ID` and `APP_PUBLIC_URL` as plain environment variables.

### Stripe Dashboard Setup
1. Create a Product + $100/month recurring Price → note the `price_xxx` ID
2. Add a webhook endpoint: `https://<your-domain>/api/stripe/webhook`
3. Enable events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

### DynamoDB Table Update Required
Add a GSI on the `UsersTable` on the `stripeCustomerId` attribute:
- Index name: `by-stripe-customer`
- Partition key: `stripeCustomerId` (String)

## Subscription Flow
1. User clicks "Export PDF" on the Invoices page → paywall modal appears if not subscribed
2. Subscribe button → POST `/api/billing/checkout-session` → redirect to Stripe Checkout
3. On success → Stripe webhook fires `checkout.session.completed` → user record updated in DynamoDB
4. User lands at `/subscription?checkout=success` → success toast
5. PDF export now works; backend verifies `subscriptionStatus` is `active` or `trialing`

## Paywall
- Frontend: `isSubscriptionActive(user.subscription)` gates the Export PDF button
- Backend: `/api/generate-pdf` returns 402 with `code: SUBSCRIPTION_REQUIRED` if not active/trialing
