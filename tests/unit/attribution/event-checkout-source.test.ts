import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkout: vi
    .fn()
    .mockResolvedValue({
      id: 'cs_test',
      url: 'https://checkout.stripe.com/test',
    }),
}));
vi.mock('@/auth', () => ({
  auth: async () => ({ user: { id: 'source-test' } }),
}));
vi.mock('@/lib/payments/stripe', () => ({
  stripeIsConfigured: () => true,
  getStripe: () => ({ checkout: { sessions: { create: mocks.checkout } } }),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    classOccurrence: {
      findFirst: async () => ({
        id: 'event-test',
        template: {
          slug: 'test-event',
          name: 'Test Event',
          isEvent: true,
          dropInPriceCents: 3000,
        },
        status: 'SCHEDULED',
        startAt: new Date('2099-01-01'),
        capacity: 25,
        historicalSignupCount: 0,
        _count: { bookings: 0 },
      }),
    },
    user: {
      findUniqueOrThrow: async () => ({
        id: 'source-test',
        email: 'source@example.test',
        source_label: 'Meta Ad',
        source_fbclid: 'abc123',
      }),
    },
    waiverVersion: { findFirst: async () => ({ id: 'test-waiver' }) },
    waiverAcceptance: { findUnique: async () => ({ id: 'test-acceptance' }) },
    booking: { findUnique: async () => null },
    commerceOrder: {
      create: async () => ({ id: 'test-order' }),
      update: vi.fn(),
    },
  },
}));
import { POST } from '@/app/api/checkout/event/route';

describe('event checkout first-touch source', () => {
  beforeEach(() =>
    mocks.checkout.mockResolvedValue({
      id: 'cs_test',
      url: 'https://checkout.stripe.com/test',
    }),
  );
  it('adds the member source to Session metadata and preserves pricing and return URLs', async () => {
    const response = await POST(
      new Request('https://www.rhyzefitness.com/api/checkout/event', {
        method: 'POST',
        body: JSON.stringify({ slug: 'test-event' }),
      }),
    );
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.com/test',
    });
    expect(response.status).toBe(200);
    expect(mocks.checkout.mock.calls[0][0]).toMatchObject({
      metadata: {
        commerceOrderId: 'test-order',
        source_label: 'Meta Ad',
        source_fbclid: 'abc123',
      },
      line_items: [{ price_data: { unit_amount: 3000 }, quantity: 1 }],
      success_url:
        'https://www.rhyzefitness.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
    });
  });
});
