import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  purchaseFindUnique: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: async () => ({ user: { id: 'member_ritual' } }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    purchase: { findUnique: mocks.purchaseFindUnique },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/payments/stripe', () => ({
  stripeIsConfigured: () => true,
  getStripe: () => ({ checkout: { sessions: { retrieve: vi.fn() } } }),
}));

vi.mock('@/lib/payments/transaction-retry', () => ({
  retrySerializableTransaction: vi.fn(),
}));

vi.mock('@/lib/payments/webhook-processor', () => ({
  processStripeEvent: vi.fn(),
}));

vi.mock('@/lib/payments/membership-checkout-return', () => ({
  fulfillMembershipCheckoutReturn: async (
    _input: unknown,
    gateway: { findPurchase: (purchaseId: string) => Promise<unknown> },
  ) => {
    await gateway.findPurchase('purchase_ritual');
    return 'fulfilled';
  },
}));

import { GET } from '@/app/api/checkout/membership/success/route';

describe('membership checkout success route attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.purchaseFindUnique.mockResolvedValue({
      id: 'purchase_ritual',
      userId: 'member_ritual',
      stripeCheckoutSessionId: 'cs_ritual',
      product: { kind: 'LIMITED_MEMBERSHIP', slug: 'ritual' },
    });
  });

  it('returns the verified product and Stripe session ID to the membership page', async () => {
    const response = await GET(
      new Request(
        'https://www.rhyzefitness.com/api/checkout/membership/success?session_id=cs_ritual&plan=elevate',
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://www.rhyzefitness.com/member/membership?result=success&plan=ritual&session_id=cs_ritual',
    );
  });
});
