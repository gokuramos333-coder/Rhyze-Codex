import { afterEach, describe, expect, it } from 'vitest';
import {
  stripeAccountMode,
  stripeConfiguration,
} from '@/lib/payments/stripe';

const originalSecret = process.env.STRIPE_SECRET_KEY;
const originalWebhook = process.env.STRIPE_WEBHOOK_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalSecret;
  if (originalWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = originalWebhook;
});

describe('Stripe configuration readiness', () => {
  it('fails closed when no private Stripe configuration exists', () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    expect(stripeConfiguration()).toEqual({
      checkout: false,
      webhooks: false,
      portal: false,
    });
    expect(stripeAccountMode()).toBe('unconfigured');
  });

  it('does not report webhook readiness until both secrets exist', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_rhyze';
    delete process.env.STRIPE_WEBHOOK_SECRET;

    expect(stripeConfiguration()).toEqual({
      checkout: true,
      webhooks: false,
      portal: true,
    });
    expect(stripeAccountMode()).toBe('test');
  });

  it('identifies live credentials without returning the secret', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_rhyze';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_rhyze';

    expect(stripeConfiguration()).toEqual({
      checkout: true,
      webhooks: true,
      portal: true,
    });
    expect(stripeAccountMode()).toBe('live');
  });
});
