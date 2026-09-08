import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function stripeIsConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripeConfiguration() {
  const checkout = Boolean(process.env.STRIPE_SECRET_KEY);
  return {
    checkout,
    webhooks: checkout && Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    portal: checkout,
  };
}

export function stripeAccountMode(): 'test' | 'live' | 'unconfigured' {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return 'unconfigured';
  return key.startsWith('sk_live_') ? 'live' : 'test';
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe is not connected yet.');
  stripeClient ??= new Stripe(key);
  return stripeClient;
}
