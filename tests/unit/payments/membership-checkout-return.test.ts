import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkoutCreate: vi.fn(),
  purchaseCreate: vi.fn(),
  purchaseUpdate: vi.fn(),
  productFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  waiverFindFirst: vi.fn(),
  waiverAcceptanceFindUnique: vi.fn(),
  membershipFindFirst: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    throw new Error(`redirect:${destination}`);
  },
}));

vi.mock('@/lib/auth/session', () => ({
  requireArea: async () => ({
    id: 'user_intro',
    email: 'intro@example.com',
    name: 'Intro Member',
  }),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    product: { findFirst: mocks.productFindFirst },
    user: { findUnique: mocks.userFindUnique },
    waiverVersion: { findFirst: mocks.waiverFindFirst },
    waiverAcceptance: { findUnique: mocks.waiverAcceptanceFindUnique },
    membership: { findFirst: mocks.membershipFindFirst },
    discountRedemption: { findUnique: vi.fn() },
    referralCode: { findFirst: vi.fn() },
    referralAttribution: { upsert: vi.fn() },
    purchase: {
      create: mocks.purchaseCreate,
      update: mocks.purchaseUpdate,
    },
  },
}));

vi.mock('@/lib/payments/stripe', () => ({
  stripeIsConfigured: () => true,
  getStripe: () => ({
    coupons: { create: vi.fn() },
    checkout: { sessions: { create: mocks.checkoutCreate } },
  }),
}));

vi.mock('@/lib/catalog/product-availability', () => ({
  isProductAvailable: () => true,
  isProductActiveInWindow: () => true,
}));

vi.mock('@/lib/catalog/private-membership', () => ({
  canAccessPrivateMembership: () => false,
}));

vi.mock('@/lib/domain/referrals/referral-service', () => ({
  isReferralEligibleProduct: () => false,
  referralDiscountCents: () => 0,
}));

vi.mock('@/lib/notifications/email-queue', () => ({
  queueEmail: vi.fn(),
}));

import { startCheckoutAction } from '@/app/(portal)/member/membership/actions';

describe('membership checkout return', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com');
    mocks.productFindFirst.mockResolvedValue({
      id: 'product_intro',
      slug: 'intro-offer-7-days',
      kind: 'INTRO_TRIAL',
      billingInterval: 'ONE_TIME',
      priceCents: 700,
      stripePriceId: 'price_intro',
      isPublic: true,
      isActive: true,
    });
    mocks.userFindUnique.mockResolvedValue({ stripeCustomerId: null });
    mocks.waiverFindFirst.mockResolvedValue({ id: 'waiver_current' });
    mocks.waiverAcceptanceFindUnique.mockResolvedValue({ id: 'acceptance_1' });
    mocks.membershipFindFirst.mockResolvedValue(null);
    mocks.purchaseCreate.mockResolvedValue({ id: 'purchase_intro' });
    mocks.purchaseUpdate.mockResolvedValue({});
    mocks.checkoutCreate.mockResolvedValue({
      id: 'cs_intro',
      url: 'https://checkout.stripe.com/c/pay/cs_intro',
    });
  });

  it('returns paid memberships through immediate entitlement fulfillment', async () => {
    const formData = new FormData();
    formData.set('productId', 'product_intro');
    formData.set('trialPolicyAccepted', 'on');

    await expect(startCheckoutAction(formData)).rejects.toThrow(
      'redirect:https://checkout.stripe.com/c/pay/cs_intro',
    );

    expect(mocks.checkoutCreate).toHaveBeenCalledOnce();
    expect(mocks.purchaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        policyAcceptedAt: expect.any(Date),
        policyAcceptance: expect.objectContaining({
          lateCancellationFeeCents: 1_000,
          noShowFeeCents: 1_000,
        }),
      }),
    });
    expect(mocks.checkoutCreate.mock.calls[0][0]).toMatchObject({
      success_url:
        'https://www.rhyzefitness.com/api/checkout/membership/success?session_id={CHECKOUT_SESSION_ID}',
    });
  });
});
