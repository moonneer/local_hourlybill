/**
 * Stripe service.
 *
 * Reads credentials from environment variables, which should be injected at
 * startup from AWS Secrets Manager (same pattern as other secrets in this app):
 *
 *   STRIPE_SECRET_KEY       – sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET   – whsec_...
 *   STRIPE_PRICE_ID         – price_... (the $100/month recurring Price)
 *   APP_PUBLIC_URL          – https://your-domain.com  (no trailing slash)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeLib = require('stripe') as new (key: string, config?: Record<string, unknown>) => StripeInstance;

export interface StripeInstance {
  checkout: {
    sessions: {
      create(params: Record<string, unknown>): Promise<{ url: string | null; id: string }>;
    };
  };
  billingPortal: {
    sessions: {
      create(params: { customer: string; return_url: string }): Promise<{ url: string }>;
    };
  };
  subscriptions: {
    retrieve(id: string): Promise<StripeSubscription>;
  };
  webhooks: {
    constructEvent(payload: string | Buffer, sig: string, secret: string): StripeEvent;
  };
}

export interface StripeSubscription {
  id: string;
  status: string;
  customer: string | { id: string };
  current_period_end: number;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

let _stripe: StripeInstance | null = null;

export function stripeAvailable(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): StripeInstance {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured.');
    _stripe = new StripeLib(key, { apiVersion: '2024-11-20.acacia' });
  }
  return _stripe;
}

export function getWebhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  return s;
}

export function getPriceId(): string {
  const p = process.env.STRIPE_PRICE_ID;
  if (!p) throw new Error('STRIPE_PRICE_ID is not configured.');
  return p;
}

export function getAppPublicUrl(): string {
  return (process.env.APP_PUBLIC_URL ?? '').replace(/\/$/, '');
}

export type SubscriptionStatus =
  | 'none'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

export function isActiveSubscription(status: SubscriptionStatus | undefined): boolean {
  return status === 'active' || status === 'trialing';
}
