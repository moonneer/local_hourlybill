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
/// <reference types="node" />
/// <reference types="node" />
export interface StripeInstance {
    checkout: {
        sessions: {
            create(params: Record<string, unknown>): Promise<{
                url: string | null;
                id: string;
            }>;
        };
    };
    billingPortal: {
        sessions: {
            create(params: {
                customer: string;
                return_url: string;
            }): Promise<{
                url: string;
            }>;
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
    customer: string | {
        id: string;
    };
    current_period_end: number;
}
export interface StripeEvent {
    id: string;
    type: string;
    data: {
        object: Record<string, unknown>;
    };
}
export declare function stripeAvailable(): boolean;
export declare function getStripe(): StripeInstance;
export declare function getWebhookSecret(): string;
export declare function getPriceId(): string;
export declare function getAppPublicUrl(): string;
export type SubscriptionStatus = 'none' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';
export declare function isActiveSubscription(status: SubscriptionStatus | undefined): boolean;
//# sourceMappingURL=stripe.d.ts.map