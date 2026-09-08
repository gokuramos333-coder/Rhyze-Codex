import { describe, expect, it } from 'vitest';
import { buildRhyzePortalConfiguration } from '@/lib/payments/portal-configuration';

describe('Rhyze Stripe portal configuration', () => {
  it('allows billing access without bypassing management membership review', () => {
    const configuration = buildRhyzePortalConfiguration('https://preview.rhyzefitness.com');

    expect(configuration.default_return_url).toBe(
      'https://preview.rhyzefitness.com/member/billing',
    );
    expect(configuration.features?.payment_method_update?.enabled).toBe(true);
    expect(configuration.features?.invoice_history?.enabled).toBe(true);
    expect(configuration.features?.subscription_cancel?.enabled).toBe(false);
    expect(configuration.features?.subscription_update?.enabled).toBe(false);
  });
});
