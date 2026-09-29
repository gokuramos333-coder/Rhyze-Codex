import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stripeMocks = vi.hoisted(() => ({
  chargesList: vi.fn(),
  sessionsList: vi.fn(),
  accountRetrieve: vi.fn(),
  processEvent: vi.fn(),
  refundsList: vi.fn(),
  disputesList: vi.fn(),
}));

vi.mock('@/lib/payments/stripe', () => ({
  stripeIsConfigured: () => true,
  getStripe: () => ({
    accounts: { retrieve: stripeMocks.accountRetrieve },
    charges: { list: stripeMocks.chargesList },
    refunds: { list: stripeMocks.refundsList },
    disputes: { list: stripeMocks.disputesList },
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
    currency: 'usd',
    occurredAt: new Date(1_785_000_000_000),
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
  const receipts: any[] = [];
  const db = {
    sombleTransaction: { findMany: vi.fn(async () => []) },
    user: { findFirst: vi.fn(async (_args: unknown) => ({ id: 'user_intro' })) },
    stripeEvent: { upsert: vi.fn(async (args: unknown) => { receipts.push(args); return {}; }) },
    paymentRecord: {
      findFirst: vi.fn(async () => record),
      findMany: vi.fn(async () => (record ? [record] : [])),
      update: vi.fn(async (args: unknown) => { writes.push(args); return record; }),
      create: vi.fn(async (args: unknown) => { writes.push(args); return record; }),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db)),
  };
  return { db, writes, receipts };
}

describe('scheduled Stripe reconciliation', () => {
  it('keeps a PI-backed Somble import as one payment while recording its provider receipt', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge()], has_more: false });
    const { db, writes, receipts } = database(null);
    db.sombleTransaction.findMany.mockResolvedValue([{ paymentId: 'pi_intro' }] as never);
    const result = await syncRecentStripePaymentRecords(db as never, { financialOnly: true });
    expect(db.sombleTransaction.findMany).toHaveBeenCalledWith({ where: { paymentId: { in: expect.arrayContaining(['ch_intro', 'pi_intro']) } }, select: { paymentId: true } });
    expect(writes).toHaveLength(0);
    expect(receipts).toHaveLength(1);
    expect(result).toMatchObject({ skippedSombleBacked: 1 });
  });
  it('preserves the existing member when a friend paid using a different billing email', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ amount_captured: 600, billing_details: { email: 'friend@example.test', name: 'Friend' } as Stripe.Charge.BillingDetails })], has_more: false });
    const { db, writes } = database(linkedRecord({ userId: 'ticket-owner', customerEmail: 'owner@example.test', customerName: 'Ticket Owner' }));
    db.user.findFirst.mockResolvedValue({ id: 'friend' });
    await syncRecentStripePaymentRecords(db as never, { financialOnly: true });
    expect(writes).toEqual([expect.objectContaining({ data: expect.objectContaining({ amountCents: 600 }) })]);
    const data = (writes[0] as { data: Record<string, unknown> }).data;
    expect(data.userId === undefined || data.userId === 'ticket-owner').toBe(true);
    expect(data.customerEmail === undefined || data.customerEmail === 'owner@example.test').toBe(true);
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });
  it('does not infer an unowned payment member from payer email when purchase metadata names a different owner', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ metadata: { userId: 'right-owner', purchaseId: 'right-purchase' } })], has_more: false });
    const { db, writes } = database(null);
    db.user.findFirst.mockImplementation(async (args: any) => args.where.id === 'right-owner' ? { id: 'right-owner' } : { id: 'payer' });
    await syncRecentStripePaymentRecords(db as never, { financialOnly: true });
    expect((writes[0] as any).data.userId).toBe('right-owner');
  });
  it('marks a partially captured authorization fully refunded when all captured funds were returned', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ amount: 700, amount_captured: 500, amount_refunded: 500, refunded: true })], has_more: false });
    const { db, writes } = database(linkedRecord());
    await syncRecentStripePaymentRecords(db as never, { financialOnly: true });
    expect(writes).toEqual([expect.objectContaining({ data: expect.objectContaining({ status: 'REFUNDED', amountCents: 500, refundedAmountCents: 500 }) })]);
  });
  it('never replays fulfillment for a provider-refunded purchase during recent sync', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ amount_refunded: 500 })], has_more: false });
    stripeMocks.sessionsList.mockResolvedValue({ data: [{ id: 'cs_intro', payment_status: 'paid', metadata: { purchaseId: 'purchase_intro' } }] });
    const { db, writes } = database(linkedRecord());
    await syncRecentStripePaymentRecords(db as never);
    expect(writes).toEqual([expect.objectContaining({ data: expect.objectContaining({ status: 'PARTIALLY_REFUNDED', refundedAmountCents: 500 }) })]);
    expect(stripeMocks.processEvent).not.toHaveBeenCalled();
  });
  it('records authorization evidence without creating a successful payment for uncaptured funds', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ captured: false, amount_captured: 0 })], has_more: false });
    const { db, writes, receipts } = database(null);
    const result = await syncRecentStripePaymentRecords(db as never, { financialOnly: true });
    expect(result).toMatchObject({ synced: 0, capturedCharges: 0 });
    expect(writes).toEqual([]); expect(receipts).toHaveLength(1);
    expect(stripeMocks.sessionsList).not.toHaveBeenCalled();
  });
  it('does not let a failed attempt sharing the payment intent overwrite a captured charge', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ id: 'ch_failed', paid: false, captured: false, amount_captured: 0, status: 'failed' }), charge()], has_more: false });
    const { db, writes, receipts } = database(linkedRecord());
    const result = await syncRecentStripePaymentRecords(db as never, { financialOnly: true });
    expect(result).toMatchObject({ synced: 0, unchanged: 1, capturedCharges: 1 });
    expect(writes).toEqual([]); expect(receipts).toHaveLength(2);
  });
  it('returns sanitized receipts and currency totals in dry run without any database mutations', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ balance_transaction: { id: 'txn1', amount: 700, currency: 'usd', fee: 51, net: 649, created: 1785000010, type: 'charge', exchange_rate: null } as Stripe.BalanceTransaction })], has_more: false });
    const { db, receipts, writes } = database(null);
    const result = await syncRecentStripePaymentRecords(db as never, { from: new Date('2026-07-01'), to: new Date('2026-08-01'), dryRun: true });
    expect(result).toMatchObject({ receiptsStored: 0, providerReceipts: [expect.objectContaining({ type: 'rhyze.payment.reconciled' })], providerTotals: { capturedByCurrency: { usd: 700 }, refundedByCurrency: {}, feesByCurrency: { usd: 51 }, chargesWithUnknownFees: 0 } });
    expect(writes).toEqual([]); expect(receipts).toEqual([]);
    expect(stripeMocks.sessionsList).not.toHaveBeenCalled();
  });
  it('refuses an incomplete refund listing before any database writes', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ amount_refunded: 500 })], has_more: false });
    stripeMocks.refundsList.mockResolvedValue({ data: [], has_more: false });
    const { db, receipts, writes } = database(null);
    await expect(syncRecentStripePaymentRecords(db as never, { financialOnly: true })).rejects.toThrow(/refund.*total/i);
    expect(writes).toEqual([]); expect(receipts).toEqual([]);
  });
  it.each([false, true])('persists a minimal provider receipt even when the payment is unchanged or Somble-backed (%s)', async somble => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ balance_transaction: { id: 'txn1', amount: 700, currency: 'usd', fee: 51, net: 649, created: 1785000010, type: 'charge', exchange_rate: null } as Stripe.BalanceTransaction })], has_more: false });
    const { db, receipts, writes } = database(linkedRecord());
    if (somble) db.sombleTransaction.findMany.mockResolvedValue([{ paymentId: 'ch_intro' }] as never);
    await syncRecentStripePaymentRecords(db as never, { financialOnly: somble });
    expect(writes).toEqual([]);
    expect(receipts).toHaveLength(1);
    const receipt = receipts[0].create;
    expect(receipt).toMatchObject({ id: 'rhyze-payment-reconciled-acct_rhyze-ch_intro', type: 'rhyze.payment.reconciled', payload: { account: 'acct_rhyze', livemode: true, created: 1785000000, data: { object: { id: 'ch_intro', amount_captured: 700, currency: 'usd', capturedAt: 1785000010, balance_transaction: { fee: 51, net: 649 } } } } });
    expect(JSON.stringify(receipt)).not.toContain('member@example.com');
    expect(JSON.stringify(receipt)).not.toContain('billing_details');
  });
  it('stores each provider refund date after reading all refund pages', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ amount_refunded: 500 })], has_more: false });
    stripeMocks.refundsList.mockResolvedValueOnce({ data: [{ id: 're1', amount: 300, currency: 'usd', status: 'succeeded', created: 1786795200, charge: 'ch_intro', payment_intent: 'pi_intro' }], has_more: true }).mockResolvedValueOnce({ data: [{ id: 're2', amount: 200, currency: 'usd', status: 'succeeded', created: 1789473600, charge: 'ch_intro', payment_intent: 'pi_intro' }], has_more: false });
    const { db, receipts } = database(linkedRecord());
    await syncRecentStripePaymentRecords(db as never, { financialOnly: true });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].create.payload.data.object.refunds.data.map((refund: any) => [refund.id, refund.amount, refund.created])).toEqual([['re1', 300, 1786795200], ['re2', 200, 1789473600]]);
    expect(stripeMocks.refundsList).toHaveBeenLastCalledWith({ charge: 'ch_intro', limit: 100, starting_after: 're1' });
  });
  it('reconciles non-USD captured charges in their original currency', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ currency: 'eur', amount: 2500, amount_captured: 2500 })], has_more: false });
    const { db, writes, receipts } = database(null);
    const result = await syncRecentStripePaymentRecords(db as never, { financialOnly: true });
    expect(result).toMatchObject({ synced: 1, paidCharges: 1, currencies: { eur: 1 } });
    expect(writes).toEqual([expect.objectContaining({ data: expect.objectContaining({ amountCents: 2500, currency: 'eur' }) })]);
  });
  it('repairs a stale payment date in historical mode without replaying checkout fulfillment', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge()], has_more: false });
    stripeMocks.sessionsList.mockResolvedValue({ data: [{ id: 'cs_intro', payment_status: 'paid', metadata: { purchaseId: 'purchase_intro' } }] });
    const { db, writes } = database(linkedRecord({ occurredAt: new Date('2026-06-01') }));
    const result = await syncRecentStripePaymentRecords(db as never, { from: new Date('2026-07-01'), to: new Date('2026-08-01') });
    expect(result).toMatchObject({ synced: 1, fulfilledCheckoutSessions: 0, financialOnly: true });
    expect(writes).toEqual([expect.objectContaining({ data: expect.objectContaining({ occurredAt: new Date(1_785_000_000_000), amountCents: 700 }) })]);
    expect(stripeMocks.processEvent).not.toHaveBeenCalled();
    expect(stripeMocks.sessionsList).not.toHaveBeenCalled();
  });
  it('reads every page inside explicit historical bounds without fulfilling entitlements or writing in dry run', async () => {
    stripeMocks.chargesList.mockResolvedValueOnce({ data: [charge()], has_more: true }).mockResolvedValueOnce({ data: [charge({ id: 'ch_second', payment_intent: 'pi_second' })], has_more: false });
    stripeMocks.sessionsList.mockResolvedValue({ data: [{ id: 'cs1', payment_status: 'paid', metadata: { purchaseId: 'p1' } }] });
    const { db, writes } = database(null);
    const result = await syncRecentStripePaymentRecords(db as never, { from: new Date('2026-08-01T04:00:00Z'), to: new Date('2026-09-01T04:00:00Z'), maxPages: 2, dryRun: true });
    expect(result).toMatchObject({ chargeCount: 2, synced: 0, wouldSync: 2, hasMore: false, pagesRead: 2 });
    expect(stripeMocks.chargesList).toHaveBeenLastCalledWith({ created: { gte: 1785556800, lt: 1788235200 }, limit: 100, expand: ['data.balance_transaction'], starting_after: 'ch_intro' });
    expect(writes).toEqual([]);
    expect(stripeMocks.processEvent).not.toHaveBeenCalled();
  });
  it('returns a continuation cursor rather than silently truncating history at the page limit', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge()], has_more: true });
    const { db } = database(null);
    const result = await syncRecentStripePaymentRecords(db as never, { from: new Date('2026-08-01'), to: new Date('2026-09-01'), maxPages: 1, dryRun: true });
    expect(result).toMatchObject({ hasMore: true, nextCursor: 'ch_intro', pagesRead: 1 });
  });
  it('rejects reversed historical bounds before calling the provider', async () => {
    const { db } = database(null);
    await expect(syncRecentStripePaymentRecords(db as never, { from: new Date('2026-09-01'), to: new Date('2026-08-01') })).rejects.toThrow(/bounds/i);
    expect(stripeMocks.chargesList).not.toHaveBeenCalled();
  });
  afterEach(() => vi.unstubAllEnvs());
  it('refuses a test charge batch before database reads or writes on the live site', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com');
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ livemode: false })] });
    const { db, writes } = database(null);
    await expect(syncRecentStripePaymentRecords(db as never)).rejects.toThrow(/live Stripe/);
    expect(writes).toEqual([]);
    expect(db.sombleTransaction.findMany).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    stripeMocks.accountRetrieve.mockResolvedValue({ id: 'acct_rhyze' });
    stripeMocks.sessionsList.mockResolvedValue({ data: [] });
    stripeMocks.processEvent.mockResolvedValue(undefined);
    stripeMocks.refundsList.mockResolvedValue({ data: [{ id: 're_default', amount: 500, currency: 'usd', status: 'succeeded', created: 1786795200, charge: 'ch_intro', payment_intent: 'pi_intro' }], has_more: false });
    stripeMocks.disputesList.mockResolvedValue({ data: [], has_more: false });
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

  it('does not mark linked commerce orders refunded from charge amount_refunded alone', async () => {
    stripeMocks.chargesList.mockResolvedValue({ data: [charge({ amount_refunded: 700, refunded: true })] });
    stripeMocks.refundsList.mockResolvedValue({ data: [{ id: 're_full', amount: 700, currency: 'usd', status: 'succeeded', created: 1786795200, charge: 'ch_intro', payment_intent: 'pi_intro' }], has_more: false });
    const { db, writes } = database(linkedRecord({
      purchaseId: null,
      purchase: null,
      commerceOrderId: 'order_event',
      commerceOrder: { status: 'PAID' },
    }));

    const result = await syncRecentStripePaymentRecords(db as never, { lookbackDays: 14 });

    expect(result).toMatchObject({ synced: 0, unchanged: 1 });
    expect(writes).toEqual([]);
    expect(stripeMocks.processEvent).not.toHaveBeenCalled();
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
