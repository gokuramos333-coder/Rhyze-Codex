import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), order: vi.fn(), update: vi.fn() }));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: 'member' } }) }));
vi.mock('@/lib/payments/stripe', () => ({ stripeIsConfigured: () => true, getStripe: () => ({ checkout: { sessions: { create: mocks.create } } }) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  classOccurrence: { findFirst: async () => ({ id: 'event', startAt: new Date('2099-01-01'), status: 'SCHEDULED', capacity: 20, priceCents: 3000, historicalSignupCount: 0, template: { name: 'Hip Hop', slug: 'hip-hop', isEvent: true }, _count: { bookings: 0 } }) },
  user: { findUniqueOrThrow: async () => ({ id: 'member', name: 'Member', email: 'member@example.test', stripeCustomerId: 'cus_existing' }) },
  waiverVersion: { findFirst: async () => ({ id: 'waiver' }) }, waiverAcceptance: { findUnique: async () => ({ id: 'accepted' }) },
  booking: { findUnique: async () => null }, commerceOrder: { create: mocks.order, update: mocks.update },
} }));
import { POST } from '@/app/api/checkout/event/route';
beforeEach(() => { vi.clearAllMocks(); mocks.order.mockResolvedValue({ id: 'order' }); mocks.create.mockResolvedValue({ id: 'cs_session', url: 'https://checkout.stripe.com/example' }); mocks.update.mockResolvedValue({}); });
it('omits Link on the actual event Checkout request while preserving its amount and member/order metadata', async () => {
  const response = await POST(new Request('https://rhyzefitness.com/api/checkout/event', { method: 'POST', body: JSON.stringify({ slug: 'hip-hop' }) }));
  expect(response.status).toBe(200);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ wallet_options: { link: { display: 'never' } }, mode: 'payment', customer: 'cus_existing', metadata: expect.objectContaining({ commerceOrderId: 'order', occurrenceId: 'event', userId: 'member' }), line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 3000 }) })] }), { idempotencyKey: 'event-checkout-order' });
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('payment_method_types');
});
