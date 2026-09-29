import Stripe from 'stripe';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  refresh: vi.fn(),
  account: vi.fn(),
  rows: new Map<string, any>(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/payments/stripe', () => ({
  getStripe: () => ({
    webhooks: Stripe.webhooks,
    accounts: { retrieve: mocks.account },
  }),
  stripeAccountMode: () => 'live',
}));
vi.mock('@/lib/payments/webhook-processor', () => ({
  processStripeEvent: mocks.process,
}));
vi.mock('@/lib/payments/stripe-receipt-refresh', async (actual) => ({
  ...(await actual<object>()),
  refreshStripeEventReceipt: mocks.refresh,
}));
vi.mock('@/lib/db/prisma', () => {
  const stripeEvent = {
    updateMany: vi.fn(async () => ({ count: 0 })),
    findUnique: vi.fn(
      async ({ where }: any) => mocks.rows.get(where.id) || null,
    ),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const row = mocks.rows.has(where.id)
        ? { ...mocks.rows.get(where.id), ...update }
        : create;
      mocks.rows.set(where.id, row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = { ...mocks.rows.get(where.id), ...data };
      mocks.rows.set(where.id, row);
      return row;
    }),
  };
  return {
    prisma: {
      stripeEvent,
      $transaction: async (fn: any) => fn({ stripeEvent }),
    },
  };
});
import { POST } from '@/app/api/stripe/webhook/route';
const payload = (extra = {}) =>
  JSON.stringify({
    id: 'evt_sale',
    type: 'charge.succeeded',
    livemode: true,
    created: 1785000000,
    data: { object: { id: 'ch_sale', object: 'charge', livemode: true } },
    ...extra,
  });
const send = (body = payload()) =>
  POST(
    new Request('https://www.rhyzefitness.com/api/stripe/webhook', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': Stripe.webhooks.generateTestHeaderString({
          payload: body,
          secret: 'whsec_receipt',
        }),
      },
    }),
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows.clear();
  mocks.account.mockResolvedValue({ id: 'acct_site' });
  mocks.refresh.mockResolvedValue(undefined);
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_test');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_receipt');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com');
});
afterEach(() => vi.unstubAllEnvs());
it('commits payment processing once, returns retryable failure, then refreshes the receipt on a signed duplicate without replaying entitlements', async () => {
  mocks.refresh.mockRejectedValueOnce(new Error('Provider unavailable'));
  expect((await send()).status).toBe(500);
  expect(mocks.rows.get('evt_sale')).toMatchObject({
    processedAt: expect.any(Date),
    error: 'Provider unavailable',
    payload: JSON.parse(payload()),
  });
  const processedAt = mocks.rows.get('evt_sale').processedAt;
  expect((await send()).status).toBe(200);
  expect(mocks.process).toHaveBeenCalledTimes(1);
  expect(mocks.refresh).toHaveBeenCalledTimes(2);
  expect(mocks.rows.get('evt_sale')).toMatchObject({
    processedAt,
    error: null,
  });
});
it('rejects another account before payment processing or receipt writes', async () => {
  expect((await send(payload({ account: 'acct_other' }))).status).toBe(400);
  expect(mocks.process).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.rows.size).toBe(0);
});
it('does not reach receipt or payment processing for an invalid signature', async () => {
  const response = await POST(
    new Request('https://www.rhyzefitness.com/api/stripe/webhook', {
      method: 'POST',
      body: payload(),
      headers: { 'stripe-signature': 'invalid' },
    }),
  );
  expect(response.status).toBe(400);
  expect(mocks.rows.size).toBe(0);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it('retains signed adjustment evidence and returns retryable failure when account lookup is unavailable', async () => {
  mocks.account.mockRejectedValueOnce(new Error('network unavailable'));
  expect((await send(payload({ type: 'charge.refunded' }))).status).toBe(500);
  expect(mocks.rows.get('evt_sale')).toMatchObject({
    type: 'charge.refunded',
    payload: JSON.parse(payload({ type: 'charge.refunded' })),
  });
  expect(mocks.process).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
