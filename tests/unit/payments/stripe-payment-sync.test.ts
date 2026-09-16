import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripeMocks = vi.hoisted(() => ({
  chargesList: vi.fn(),
  sessionsList: vi.fn(),
  accountRetrieve: vi.fn(),
  processEvent: vi.fn(),
}));

vi.mock('@/lib/payments/stripe', () => ({
  stripeIsConfigured: () => true,
  getStripe: () => ({
    accounts: { retrieve: stripeMocks.accountRetrieve },
    charges: { list: stripeMocks.chargesList },
    checkout: { sessions: { list: stripeMocks.sessionsList } },
  }),
}));
vi.mock('@/lib/payments/webhook-processor', () => ({
  processStripeEvent: stripeMocks.processEvent,
}));

import { syncRecentStripePaymentRecords } from '@/lib/payments/stripe-payment-sync';

function charge(overrides: Partial<Stripe.Charge> = {}) {
  return {
    id: 'ch_intro',
    paid: true,
    currency: 'usd',
    amount: 700,
    amount_captured: 700,
    amount_refunded: 0,
    refunded: false,
    disputed: false,
    created: 1_785_000_000,
    livemode: true,
    payment_intent: 'pi_intro',
    billing_details: { email: 'member@example.com', name: 'Member' },
    metadata: {},
    receipt_url: null,
    customer: 'cus_intro',
    ...overrides,
  } as Stripe.Charge;
}

function linkedRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment_intro',
    stripePaymentIntentId: 'pi_intro',
    stripeEventId: 'evt_intro',
    stripeCheckoutSessionId: 'cs_intro',
    status: 'SUCCEEDED',
    amountCents: 700,
    refundedAmountCents: 0,
    purchaseId: 'purchase_intro',
    purchase: { status: 'PAID' },
    commerceOrderId: null,
    commerceOrder: null,
    membershipId: null,
    ...overrides,
  };
}

function database(record: ReturnType<typeof linkedRecord> | null) {
  const writes: unknown[] = [];
  const db = {
    sombleTransaction: { findMany: vi.fn(async () => []) },
    user: { findFirst: vi.fn(async () => ({ id: 'user_intro' })) },
    paymentRecord: {
      findFirst: vi.fn(async () => record),
      findMany: vi.fn(async () => (record ? [record] : [])),
      update: vi.fn(async (args: unknown) => { writes.push(args); return record; }),
      create: vi.fn(async (args: unknown) => { writes.push(args); return record; }),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db)),
  };
  return { db, writes };
}

describe('scheduled Stripe reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeMocks.accountRetrieve.mockResolvedValue({ id: 'acct_rhyze' });
    stripeMocks.sessionsList.mockResolvedValue({ data: [] });
    stripeMocks.processEvent.mockResolvedValue(undefined);
  });

  it('does not rewrite or re-fulfill an unchanged, completed purchase', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge()] });
    const { db, writes } = database(linkedRecord());

    const result = await syncRecentStripePaymentRecords(db as never, { lookbackDays: 14 });

    expect(result).toMatchObject({ synced: 0, unchanged: 1 });
    expect(writes).toEqual([]);
    expect(stripeMocks.sessionsList).not.toHaveBeenCalled();
    expect(stripeMocks.processEvent).not.toHaveBeenCalled();
  });

  it('checks a batch of completed charges without one database lookup per charge', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [
      charge(),
      charge({ id: 'ch_ritual', payment_intent: 'pi_ritual', amount: 16800, amount_captured: 16800 }),
    ] });
    const first = linkedRecord();
    const second = linkedRecord({
      id: 'payment_ritual', stripePaymentIntentId: 'pi_ritual',
      amountCents: 16800, purchaseId: 'purchase_ritual',
    });
    const { db, writes } = database(first);
    db.paymentRecord.findMany.mockResolvedValue([first, second]);

    const result = await syncRecentStripePaymentRecords(db as never, { lookbackDays: 14 });

    expect(result).toMatchObject({ synced: 0, unchanged: 2 });
    expect(db.paymentRecord.findMany).toHaveBeenCalledOnce();
    expect(db.paymentRecord.findFirst).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('still updates a charge when Stripe reports a new refund', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ amount_refunded: 500 })] });
    const { db, writes } = database(linkedRecord());

    const result = await syncRecentStripePaymentRecords(db as never, { lookbackDays: 14 });

    expect(result).toMatchObject({ synced: 1 });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ data: { status: 'PARTIALLY_REFUNDED', refundedAmountCents: 500 } });
  });

  it('continues checkout recovery when a matching purchase is still pending', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge()] });
    stripeMocks.sessionsList.mockResolvedValue({ data: [{
      id: 'cs_intro', payment_status: 'paid', metadata: { purchaseId: 'purchase_intro' }, created: 1_785_000_000,
    }] });
    const { db } = database(linkedRecord({ purchase: { status: 'PENDING' } }));

    const result = await syncRecentStripePaymentRecords(db as never, { lookbackDays: 14 });

    expect(result).toMatchObject({ synced: 1, fulfilledCheckoutSessions: 1 });
    expect(stripeMocks.processEvent).toHaveBeenCalledOnce();
  });
});
