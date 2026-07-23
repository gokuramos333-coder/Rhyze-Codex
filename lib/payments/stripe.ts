import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function stripeIsConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe is not connected yet.');
  stripeClient ??= new Stripe(key);
  return stripeClient;
}
