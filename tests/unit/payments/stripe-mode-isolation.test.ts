import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStripe, stripeConfiguration } from '@/lib/payments/stripe';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { syntheticCheckoutEvent } from '@/lib/payments/stripe-payment-sync';

afterEach(() => vi.unstubAllEnvs());

describe('production Stripe isolation', () => {
  it.each(['sk_test_example', 'rk_test_example'])('refuses a test credential on the live domain: %s', (key) => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com');
    vi.stubEnv('CONTEXT', 'deploy-preview');
    vi.stubEnv('STRIPE_SECRET_KEY', key);
    expect(stripeConfiguration().checkout).toBe(false);
    expect(() => getStripe()).toThrow(/live.*Stripe|Stripe.*live/i);
  });

  it('refuses a test credential in production even if the URL is misconfigured', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://preview.netlify.app');
    vi.stubEnv('CONTEXT', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    expect(() => getStripe()).toThrow(/live.*Stripe|Stripe.*live/i);
  });

  it.each(['deploy-preview', 'branch-deploy'])('refuses sandbox billing in a promotable Netlify %s even without the canonical URL', (context) => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://preview.netlify.app');
    vi.stubEnv('CONTEXT', context);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    expect(() => getStripe()).toThrow(/live.*Stripe|Stripe.*live/i);
  });

  it('keeps sandbox testing available on an isolated local site', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    vi.stubEnv('CONTEXT', 'dev');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    expect(stripeConfiguration().checkout).toBe(true);
  });

  it('rejects test webhook events before any production database operation', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com');
    const touched: string[] = [];
    const db = new Proxy({}, { get: (_, key) => { touched.push(String(key)); throw Error('Unexpected database access'); } });
    await expect(processStripeEvent(db as never, {
      id: 'evt_test', type: 'checkout.session.completed', livemode: false,
      data: { object: { id: 'cs_test_example', payment_status: 'paid', metadata: { purchaseId: 'purchase' } } },
    } as never)).rejects.toThrow(/test.*production|live.*Stripe/i);
    expect(touched).toEqual([]);
  });

  it('preserves provider livemode when reconciliation synthesizes a checkout event', () => {
    const event = syntheticCheckoutEvent({ id: 'cs_live_example', livemode: true, created: 1 } as never, { livemode: true, created: 1 } as never);
    expect(event.livemode).toBe(true);
  });
});
