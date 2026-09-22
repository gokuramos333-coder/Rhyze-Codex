import Stripe from 'stripe';
import { requiresLiveStripe } from '@/lib/payments/stripe-mode';

let stripeClient: Stripe | null = null;
let clientKey: string | undefined;

export function stripeIsConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY) && (!requiresLiveStripe() || stripeAccountMode() === 'live');
}

export function stripeConfiguration() {
  const checkout = stripeIsConfigured();
  return {
    checkout,
    webhooks: checkout && Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    portal: checkout,
  };
}

export function stripeAccountMode(): 'test' | 'live' | 'unconfigured' {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return 'unconfigured';
  return /^(sk|rk)_live_/.test(key) ? 'live' : 'test';
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe is not connected yet.');
  if (requiresLiveStripe() && stripeAccountMode() !== 'live') {
    throw new Error('Production requires a live Stripe key; test payments are disabled.');
  }
  if (!stripeClient || clientKey !== key) {
    stripeClient = new Stripe(key);
    clientKey = key;
  }
  return stripeClient;
}
