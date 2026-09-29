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
      slug: 'intro-offer',
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
      wallet_options: { link: { display: 'never' } },
      success_url:
        'https://www.rhyzefitness.com/api/checkout/membership/success?session_id={CHECKOUT_SESSION_ID}&plan=intro_7day',
      cancel_url:
        'https://www.rhyzefitness.com/member/membership?result=cancelled&plan=intro_7day',
    });
  });

  it('creates one-time pack checkout even when the saved price is recurring, without charging or subscribing', async () => {
    mocks.productFindFirst.mockResolvedValue({
      id: 'product-eight-class-pack-2026', name: '8-Class Pack', slug: 'eight-class-pack',
      description: 'Eight classes, valid for three months', kind: 'CLASS_PACK',
      billingInterval: 'ONE_TIME', customPlanType: 'QUARTERLY_8_CLASS_PACK',
      priceCents: 17900, stripePriceId: 'price_stale_recurring', isPublic: true, isActive: true,
    });
    mocks.checkoutCreate.mockImplementation(async (params) => {
      if (params.mode === 'payment' && params.line_items[0].price === 'price_stale_recurring') {
        throw new Error('You specified payment mode but passed a recurring price');
      }
      return { id: 'cs_pack', url: 'https://checkout.stripe.com/c/pay/cs_pack' };
    });
    const form = new FormData();
    form.set('productId', 'product-eight-class-pack-2026');
    // Browser-submitted amounts/cadences must never override the database.
    form.set('priceCents', '1');
    form.set('billingInterval', 'MONTHLY');
    await expect(startCheckoutAction(form)).rejects.toThrow('redirect:https://checkout.stripe.com/c/pay/cs_pack');
    expect(mocks.checkoutCreate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      mode: 'payment', subscription_data: undefined,
      line_items: [{ quantity: 1, price_data: {
        currency: 'usd', unit_amount: 17900,
        product_data: { name: '8-Class Pack', description: 'Eight classes, valid for three months', metadata: { rhyzeProductId: 'product-eight-class-pack-2026' } },
      } }],
      metadata: expect.objectContaining({ purchaseId: 'purchase_intro' }),
    }), { idempotencyKey: 'checkout-purchase_intro' });
    expect(mocks.purchaseCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ amountCents: 17900 }) });
    expect(mocks.purchaseUpdate).toHaveBeenCalledExactlyOnceWith({ where: { id: 'purchase_intro' }, data: { stripeCheckoutSessionId: 'cs_pack' } });
  });

  it('adds the saved member first-touch source to Session metadata without changing checkout URLs', async () => {
    mocks.userFindUnique.mockResolvedValue({
      stripeCustomerId: null, source_label: 'Meta Ad', source_fbclid: 'abc123',
      source_utm_campaign: 'original-campaign', source_captured_at: new Date('2026-09-22T00:00:00Z'),
    });
    const formData = new FormData();
    formData.set('productId', 'product_intro');
    formData.set('trialPolicyAccepted', 'on');
    await expect(startCheckoutAction(formData)).rejects.toThrow('redirect:https://checkout.stripe.com/c/pay/cs_intro');
    expect(mocks.checkoutCreate.mock.calls[0][0].metadata).toMatchObject({
      purchaseId: 'purchase_intro', source_label: 'Meta Ad', source_fbclid: 'abc123',
      source_utm_campaign: 'original-campaign', source_captured_at: '2026-09-22T00:00:00.000Z',
    });
  });

  it.each([
    ['intro-offer', 'INTRO_TRIAL', 'ONE_TIME', 'intro_7day'],
    ['drop-in', 'DROP_IN', 'ONE_TIME', 'single_class'],
    ['elevate', 'LIMITED_MEMBERSHIP', 'MONTHLY', 'elevate'],
    ['ritual', 'LIMITED_MEMBERSHIP', 'MONTHLY', 'ritual'],
    ['vip-access-pass', 'VIP', 'MONTHLY', 'vip_access'],
    ['eight-class-pack', 'CLASS_PACK', 'MONTHLY', 'pack_8'],
  ])(
    'returns %s with its exact advertising attribution value',
    async (slug, kind, billingInterval, planValue) => {
      mocks.productFindFirst.mockResolvedValue({
        id: `product_${slug}`,
        slug,
        kind,
        billingInterval,
        priceCents: 7_00,
        stripePriceId: `price_${slug}`,
        isPublic: true,
        isActive: true,
      });
      const formData = new FormData();
      formData.set('productId', `product_${slug}`);
      if (kind === 'INTRO_TRIAL') formData.set('trialPolicyAccepted', 'on');

      await expect(startCheckoutAction(formData)).rejects.toThrow(
        'redirect:https://checkout.stripe.com/c/pay/cs_intro',
      );

      const checkout = mocks.checkoutCreate.mock.calls.at(-1)?.[0];
      const successDestination =
        kind === 'INTRO_TRIAL'
          ? `https://www.rhyzefitness.com/api/checkout/membership/success?session_id={CHECKOUT_SESSION_ID}&plan=${planValue}`
          : `https://www.rhyzefitness.com/member/membership?result=success&plan=${planValue}&session_id={CHECKOUT_SESSION_ID}`;
      expect(checkout).toMatchObject({
        success_url: successDestination,
        cancel_url: `https://www.rhyzefitness.com/member/membership?result=cancelled&plan=${planValue}`,
      });
    },
  );
});
