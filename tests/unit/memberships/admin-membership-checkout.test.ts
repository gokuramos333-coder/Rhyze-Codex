import { describe, expect, it, vi } from 'vitest';
import { startAdminMembershipCheckout } from '@/lib/domain/memberships/admin-membership-checkout';

describe('admin membership Stripe checkout', () => {
  const client = {
    id: 'member-1',
    email: 'member@example.com',
    name: 'Member One',
    stripeCustomerId: 'cus_123',
  };
  const product = {
    id: 'vip-1',
    name: 'VIP',
    kind: 'VIP' as const,
    isActive: true,
    billingInterval: 'MONTHLY' as const,
    stripePriceId: 'price_vip',
    priceCents: 14900,
  };

  function dependencies(overrides = {}) {
    return {
      findClient: vi.fn().mockResolvedValue(client),
      findProduct: vi.fn().mockResolvedValue(product),
      hasCurrentMembership: vi.fn().mockResolvedValue(false),
      createPurchase: vi.fn().mockResolvedValue({ id: 'purchase-1' }),
      createCheckoutSession: vi.fn().mockResolvedValue({
        id: 'cs_1',
        url: 'https://checkout.stripe.com/session',
      }),
      saveCheckoutSession: vi.fn().mockResolvedValue(undefined),
      failPurchase: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('creates a client-linked subscription checkout with admin return routes', async () => {
    const deps = dependencies();
    await expect(
      startAdminMembershipCheckout(
        {
          clientId: 'member-1',
          productId: 'vip-1',
          origin: 'https://www.rhyzefitness.com',
        },
        deps,
      ),
    ).resolves.toBe('https://checkout.stripe.com/session');

    expect(deps.createPurchase).toHaveBeenCalledWith({
      userId: 'member-1',
      productId: 'vip-1',
      amountCents: 14900,
      policyAcceptance: { source: 'ADMIN_CHECKOUT' },
    });
    expect(deps.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        wallet_options: { link: { display: 'never' } },
        customer: 'cus_123',
        client_reference_id: 'purchase-1',
        success_url:
          'https://www.rhyzefitness.com/admin/members/member-1?membership=success',
        cancel_url:
          'https://www.rhyzefitness.com/admin/members/member-1?membership=cancelled',
        metadata: expect.objectContaining({
          userId: 'member-1',
          productId: 'vip-1',
          purchaseId: 'purchase-1',
        }),
      }),
      'admin-membership-checkout-purchase-1',
    );
  });

  it('adds a scoped discount for new paid memberships and records the client price', async () => {
    const createClientDiscount = vi.fn().mockResolvedValue('coupon_client');
    const deps = dependencies();
    await startAdminMembershipCheckout(
      {
        clientId: client.id,
        productId: product.id,
        origin: 'https://www.rhyzefitness.com',
        monthlyPrice: '99',
        discountDuration: 'repeating',
        discountMonths: '2',
        discountReason: 'Owner offer',
      },
      { ...deps, createClientDiscount },
    );
    expect(deps.createPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 9900,
        policyAcceptance: {
          source: 'ADMIN_CHECKOUT',
          memberPricing: expect.objectContaining({
            amountOff: 5000,
            months: 2,
          }),
        },
      }),
    );
    expect(deps.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ coupon: 'coupon_client' }],
        line_items: [{ price: 'price_vip', quantity: 1 }],
      }),
      expect.anything(),
    );
  });
  it('resumes an existing open checkout without creating another session or coupon', async () => {
    const deps = dependencies({
      createPurchase: vi
        .fn()
        .mockResolvedValue({
          id: 'purchase-1',
          stripeCheckoutSessionId: 'cs_existing',
        }),
    });
    const retrieveCheckoutSession = vi
      .fn()
      .mockResolvedValue({
        status: 'open',
        url: 'https://checkout.stripe.com/existing',
        client_reference_id: 'purchase-1',
      });
    await expect(
      startAdminMembershipCheckout(
        {
          clientId: client.id,
          productId: product.id,
          origin: 'https://www.rhyzefitness.com',
        },
        { ...deps, retrieveCheckoutSession },
      ),
    ).resolves.toBe('https://checkout.stripe.com/existing');
    expect(deps.createCheckoutSession).not.toHaveBeenCalled();
  });
  it('does not recreate a completed checkout while the webhook is pending', async () => {
    const deps = dependencies({
      createPurchase: vi
        .fn()
        .mockResolvedValue({
          id: 'purchase-1',
          stripeCheckoutSessionId: 'cs_existing',
        }),
    });
    const retrieveCheckoutSession = vi
      .fn()
      .mockResolvedValue({
        status: 'complete',
        url: null,
        client_reference_id: 'purchase-1',
      });
    await expect(
      startAdminMembershipCheckout(
        {
          clientId: client.id,
          productId: product.id,
          origin: 'https://www.rhyzefitness.com',
        },
        { ...deps, retrieveCheckoutSession },
      ),
    ).rejects.toThrow(/processing or completed/);
    expect(deps.createCheckoutSession).not.toHaveBeenCalled();
    expect(deps.failPurchase).not.toHaveBeenCalled();
  });
  it('refuses a second current membership before creating a purchase', async () => {
    const deps = dependencies({
      hasCurrentMembership: vi.fn().mockResolvedValue(true),
    });
    await expect(
      startAdminMembershipCheckout(
        {
          clientId: 'member-1',
          productId: 'vip-1',
          origin: 'https://www.rhyzefitness.com',
        },
        deps,
      ),
    ).rejects.toThrow('already has a current membership');
    expect(deps.createPurchase).not.toHaveBeenCalled();
  });

  it('uses the client source on admin-assisted checkout, never a staff source', async () => {
    const deps = dependencies({
      findClient: vi.fn().mockResolvedValue({
        ...client,
        source_label: 'Meta Ad',
        source_fbclid: 'abc123',
      }),
    });
    await startAdminMembershipCheckout(
      {
        clientId: client.id,
        productId: product.id,
        origin: 'https://www.rhyzefitness.com',
      },
      deps,
    );
    expect(deps.createCheckoutSession.mock.calls[0][0].metadata).toMatchObject({
      source_label: 'Meta Ad',
      source_fbclid: 'abc123',
    });
  });

  it('marks the pending purchase failed when Stripe checkout fails', async () => {
    const deps = dependencies({
      createCheckoutSession: vi.fn().mockRejectedValue(
        Object.assign(new Error('Stripe unavailable'), {
          type: 'StripeInvalidRequestError',
        }),
      ),
    });
    await expect(
      startAdminMembershipCheckout(
        {
          clientId: 'member-1',
          productId: 'vip-1',
          origin: 'https://www.rhyzefitness.com',
        },
        deps,
      ),
    ).rejects.toThrow('Stripe unavailable');
    expect(deps.failPurchase).toHaveBeenCalledWith('purchase-1');
  });

  it('keeps ambiguous checkout attempts pending instead of enabling a duplicate subscription', async () => {
    const deps = dependencies({
      createCheckoutSession: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    await expect(
      startAdminMembershipCheckout(
        {
          clientId: client.id,
          productId: product.id,
          origin: 'https://www.rhyzefitness.com',
        },
        deps,
      ),
    ).rejects.toThrow(/could not be verified/);
    expect(deps.failPurchase).not.toHaveBeenCalled();
  });
  it('rejects trials, one-time products, inactive products, and products without Stripe prices', async () => {
    for (const invalidProduct of [
      { ...product, kind: 'INTRO_TRIAL' as const },
      { ...product, billingInterval: 'ONE_TIME' as const },
      { ...product, isActive: false },
      { ...product, stripePriceId: null },
    ]) {
      const deps = dependencies({
        findProduct: vi.fn().mockResolvedValue(invalidProduct),
      });
      await expect(
        startAdminMembershipCheckout(
          {
            clientId: 'member-1',
            productId: 'vip-1',
            origin: 'https://www.rhyzefitness.com',
          },
          deps,
        ),
      ).rejects.toThrow('not available for paid membership checkout');
    }
  });
});
