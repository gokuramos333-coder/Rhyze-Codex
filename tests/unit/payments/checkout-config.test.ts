import { describe, expect, it } from 'vitest';
import {
  buildCheckoutCustomerParameters,
  buildPortalSessionParameters,
  buildSubscriptionData,
} from '@/lib/payments/checkout-config';

describe('Stripe checkout configuration', () => {
  it('reuses an existing Stripe customer without also sending customer_email', () => {
    expect(buildCheckoutCustomerParameters({
      customerId: 'cus_existing',
      email: 'member@example.com',
      mode: 'subscription',
    })).toEqual({ customer: 'cus_existing' });
  });

  it('creates a reusable customer for a new one-time buyer', () => {
    expect(buildCheckoutCustomerParameters({
      customerId: null,
      email: 'member@example.com',
      mode: 'payment',
    })).toEqual({ customer_email: 'member@example.com', customer_creation: 'always' });
  });

  it('builds a portal session that returns to Rhyze billing', () => {
    expect(buildPortalSessionParameters({
      customerId: 'cus_existing',
      returnUrl: 'https://rhyzefitness.com/member/billing',
      configurationId: 'bpc_123',
    })).toEqual({
      customer: 'cus_existing',
      return_url: 'https://rhyzefitness.com/member/billing',
      configuration: 'bpc_123',
    });
  });

  it('keeps monthly subscriptions anchored to the signup date', () => {
    const parameters = buildSubscriptionData({
      purchaseId: 'purchase-1',
      productId: 'product-1',
      userId: 'user-1',
    });

    expect(parameters).toEqual({
      metadata: {
        purchaseId: 'purchase-1',
        productId: 'product-1',
        userId: 'user-1',
      },
    });
    expect(parameters).not.toHaveProperty('billing_cycle_anchor');
  });
});
