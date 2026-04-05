"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isActiveSubscription = exports.getAppPublicUrl = exports.getPriceId = exports.getWebhookSecret = exports.getStripe = exports.stripeAvailable = void 0;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeLib = require('stripe');
let _stripe = null;
function stripeAvailable() {
    return !!(process.env.STRIPE_SECRET_KEY);
}
exports.stripeAvailable = stripeAvailable;
function getStripe() {
    if (!_stripe) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key)
            throw new Error('STRIPE_SECRET_KEY is not configured.');
        _stripe = new StripeLib(key, { apiVersion: '2024-11-20.acacia' });
    }
    return _stripe;
}
exports.getStripe = getStripe;
function getWebhookSecret() {
    const s = process.env.STRIPE_WEBHOOK_SECRET;
    if (!s)
        throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
    return s;
}
exports.getWebhookSecret = getWebhookSecret;
function getPriceId() {
    const p = process.env.STRIPE_PRICE_ID;
    if (!p)
        throw new Error('STRIPE_PRICE_ID is not configured.');
    return p;
}
exports.getPriceId = getPriceId;
function getAppPublicUrl() {
    return (process.env.APP_PUBLIC_URL ?? '').replace(/\/$/, '');
}
exports.getAppPublicUrl = getAppPublicUrl;
function isActiveSubscription(status) {
    return status === 'active' || status === 'trialing';
}
exports.isActiveSubscription = isActiveSubscription;
//# sourceMappingURL=stripe.js.map