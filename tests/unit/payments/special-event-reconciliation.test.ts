import type { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { expect, it, vi } from 'vitest';
import { reconcileSpecialEventCheckout } from '@/lib/payments/special-event-reconciliation';

function fixture() {
  const metadata = {
    commerceOrderId: 'order',
    occurrenceId: 'event',
    userId: 'buyer',
    purchaseType: 'EVENT',
    blackFridayTicket: '1',
  };
  const session = {
    id: 'cs_right',
    mode: 'payment',
    amount_total: 2500,
    currency: 'usd',
    client_reference_id: 'order',
    metadata,
    status: 'open',
    payment_status: 'unpaid',
    payment_intent: null,
  };
  const list = vi.fn(async () => ({ data: [session], has_more: false }));
  const retrieve = vi.fn(async () => session);
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const db = {
    $queryRaw: async () => [
      {
        orderId: 'order',
        userId: 'buyer',
        occurrenceId: 'event',
        state: 'HELD',
        parameters: { expires_at: 2000000000 },
      },
    ],
    commerceOrder: {
      findUniqueOrThrow: async () => ({
        id: 'order',
        userId: 'buyer',
        occurrenceId: 'event',
        kind: 'EVENT',
        amountCents: 2500,
        currency: 'usd',
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
      }),
      updateMany,
    },
  } as unknown as PrismaClient;
  const stripe = {
    checkout: { sessions: { list, retrieve } },
  } as unknown as Stripe;
  return { session, list, retrieve, updateMany, dependencies: { db, stripe } };
}

it.each(['incomplete', 'duplicate', 'wrong-id', 'wrong-price'])(
  'retains an unbound checkout when recovery evidence is %s',
  async (kind) => {
    const f = fixture();
    if (kind === 'incomplete')
      f.list.mockResolvedValue({ data: [f.session], has_more: true });
    if (kind === 'duplicate')
      f.list.mockResolvedValue({
        data: [f.session, { ...f.session, id: 'cs_duplicate' }],
        has_more: false,
      });
    if (kind === 'wrong-id')
      f.retrieve.mockResolvedValue({ ...f.session, id: 'cs_other' });
    if (kind === 'wrong-price')
      f.retrieve.mockResolvedValue({ ...f.session, amount_total: 3999 });
    expect(
      await reconcileSpecialEventCheckout({ orderId: 'order' }, f.dependencies),
    ).toBe('review');
    expect(f.updateMany).not.toHaveBeenCalled();
  },
);

it('binds only the uniquely recovered and freshly verified session with bounded provider requests', async () => {
  const f = fixture();
  expect(
    await reconcileSpecialEventCheckout({ orderId: 'order' }, f.dependencies),
  ).toBe('pending');
  expect(f.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }), {
    timeout: 2000,
    maxNetworkRetries: 0,
  });
  expect(f.retrieve).toHaveBeenCalledWith(
    'cs_right',
    { expand: ['payment_intent.latest_charge'] },
    { timeout: 2000, maxNetworkRetries: 0 },
  );
  expect(f.updateMany).toHaveBeenCalledWith({
    where: { id: 'order', stripeCheckoutSessionId: null },
    data: { stripeCheckoutSessionId: 'cs_right' },
  });
});

it('recovers a unique match from a later bounded provider page', async () => {
  const f = fixture();
  const other = {
    ...f.session,
    id: 'cs_unrelated',
    client_reference_id: 'other',
    metadata: { ...f.session.metadata, commerceOrderId: 'other' },
  };
  f.list.mockResolvedValueOnce({ data: [other], has_more: true });
  expect(
    await reconcileSpecialEventCheckout({ orderId: 'order' }, f.dependencies),
  ).toBe('pending');
  expect(f.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ starting_after: 'cs_unrelated' }),
    expect.anything(),
  );
});
