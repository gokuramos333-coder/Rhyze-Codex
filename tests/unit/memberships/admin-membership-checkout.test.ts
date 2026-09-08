import { describe, expect, it, vi } from 'vitest';
import { startAdminMembershipCheckout } from '@/lib/domain/memberships/admin-membership-checkout';

describe('admin membership Stripe checkout', () => {
  const client = { id: 'member-1', email: 'member@example.com', name: 'Member One', stripeCustomerId: 'cus_123' };
  const product = {
    id: 'vip-1', name: 'VIP', kind: 'VIP' as const, isActive: true,
    billingInterval: 'MONTHLY' as const, stripePriceId: 'price_vip', priceCents: 14900,
  };

  function dependencies(overrides = {}) {
    return {
      findClient: vi.fn().mockResolvedValue(client),
      findProduct: vi.fn().mockResolvedValue(product),
      hasCurrentMembership: vi.fn().mockResolvedValue(false),
      createPurchase: vi.fn().mockResolvedValue({ id: 'purchase-1' }),
      createCheckoutSession: vi.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/session' }),
      saveCheckoutSession: vi.fn().mockResolvedValue(undefined),
      failPurchase: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('creates a client-linked subscription checkout with admin return routes', async () => {
    const deps = dependencies();
    await expect(startAdminMembershipCheckout({
      clientId: 'member-1', productId: 'vip-1', origin: 'https://www.rhyzefitness.com',
    }, deps)).resolves.toBe('https://checkout.stripe.com/session');

    expect(deps.createPurchase).toHaveBeenCalledWith({
      userId: 'member-1', productId: 'vip-1', amountCents: 14900,
    });
    expect(deps.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      customer: 'cus_123',
      client_reference_id: 'purchase-1',
      success_url: 'https://www.rhyzefitness.com/admin/members/member-1?membership=success',
      cancel_url: 'https://www.rhyzefitness.com/admin/members/member-1?membership=cancelled',
      metadata: expect.objectContaining({ userId: 'member-1', productId: 'vip-1', purchaseId: 'purchase-1' }),
    }), 'admin-membership-checkout-purchase-1');
  });

  it('refuses a second current membership before creating a purchase', async () => {
    const deps = dependencies({ hasCurrentMembership: vi.fn().mockResolvedValue(true) });
    await expect(startAdminMembershipCheckout({
      clientId: 'member-1', productId: 'vip-1', origin: 'https://www.rhyzefitness.com',
    }, deps)).rejects.toThrow('already has a current membership');
    expect(deps.createPurchase).not.toHaveBeenCalled();
  });

  it('marks the pending purchase failed when Stripe checkout fails', async () => {
    const deps = dependencies({ createCheckoutSession: vi.fn().mockRejectedValue(new Error('Stripe unavailable')) });
    await expect(startAdminMembershipCheckout({
      clientId: 'member-1', productId: 'vip-1', origin: 'https://www.rhyzefitness.com',
    }, deps)).rejects.toThrow('Stripe unavailable');
    expect(deps.failPurchase).toHaveBeenCalledWith('purchase-1');
  });

  it('rejects trials, one-time products, inactive products, and products without Stripe prices', async () => {
    for (const invalidProduct of [
      { ...product, kind: 'INTRO_TRIAL' as const },
      { ...product, billingInterval: 'ONE_TIME' as const },
      { ...product, isActive: false },
      { ...product, stripePriceId: null },
    ]) {
      const deps = dependencies({ findProduct: vi.fn().mockResolvedValue(invalidProduct) });
      await expect(startAdminMembershipCheckout({
        clientId: 'member-1', productId: 'vip-1', origin: 'https://www.rhyzefitness.com',
      }, deps)).rejects.toThrow('not available for paid membership checkout');
    }
  });
});
