import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshStripeEventReceipt } from '@/lib/payments/stripe-receipt-refresh';

const url = process.env.VIP_TEST_DATABASE_URL;
if (url && (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/identity_migration')) {
  throw Error('Receipt concurrency tests require the disposable local identity_migration database');
}
describe.skipIf(!url)('concurrent provider receipts in PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const account = `acct_receipt_test_${randomUUID()}`;
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_synthetic_test');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await db.stripeEvent.deleteMany({ where: { id: { startsWith: `rhyze-payment-reconciled-${account}-` } } });
    await db.$disconnect();
  });
  it('accepts a five-event burst without losing event acknowledgments or accepting stale evidence', async () => {
    const chargeId = `ch_${randomUUID()}`;
    const charge = {
      id: chargeId, object: 'charge', livemode: true, paid: true, captured: true,
      status: 'succeeded', amount: 3000, amount_captured: 3000, currency: 'usd',
      amount_refunded: 0, refunded: false, disputed: false, created: 1785000000,
      payment_intent: 'pi_synthetic', balance_transaction: null,
    };
    let ready!: () => void;
    const allReading = new Promise<void>(resolve => { ready = resolve; });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let reads = 0;
    const stripe = { charges: { retrieve: async () => {
      reads += 1;
      if (reads <= 5) {
        if (reads === 5) ready();
        await gate;
      }
      return charge;
    } } } as unknown as Stripe;
    const ids = Array.from({ length: 5 }, (_, i) => `evt_burst_${i}`);
    const events = ids.map(id => ({ id, type: 'charge.updated', livemode: true, created: 1785000000, data: { object: charge } }) as Stripe.Event);
    const result = Promise.allSettled(events.map(event => refreshStripeEventReceipt(db, stripe, event, account)));
    try {
      await allReading;
      release();
      const outcomes = await result;
      expect(outcomes.filter(item => item.status === 'rejected').map(item => String(item.reason))).toEqual([]);
      const receipt = await db.stripeEvent.findUniqueOrThrow({ where: { id: `rhyze-payment-reconciled-${account}-${chargeId}` } });
      expect(receipt.type).toBe('rhyze.payment.reconciled');
      expect(receipt.error).toBeNull();
      expect((receipt.payload as any).acknowledgedEventIds.sort()).toEqual(ids);
      expect((receipt.payload as any).data.object.amount_captured).toBe(3000);
      expect(reads).toBeGreaterThan(5);
      expect(reads).toBeLessThanOrEqual(25);
    } finally {
      release();
      await result;
    }
  });
});
