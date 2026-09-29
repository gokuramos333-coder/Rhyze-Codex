import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { deriveStripeEventAction, processStripeEvent } from '@/lib/payments/webhook-processor';
import { syntheticCheckoutEvent } from '@/lib/payments/stripe-payment-sync';

const paid = 1789473600;
function event(amount: number | null = 2000) {
  return { id: 'evt_paid', type: 'checkout.session.completed', created: paid, data: { object: {
    id: 'cs1', created: paid - 86400, amount_total: amount, currency: 'usd', payment_status: amount === 0 ? 'no_payment_required' : 'paid', payment_intent: 'pi1', metadata: { commerceOrderId: 'o1' },
  } } } as unknown as Stripe.Event;
}

describe('provider-backed checkout financials', () => {
  it('interprets actual discounted total, currency and completion time', () => {
    expect(deriveStripeEventAction(event())).toMatchObject({ amountCents: 2000, currency: 'usd', occurredAt: new Date('2026-09-15T12:00:00Z') });
  });
  it.each([2000, 0])('persists provider paid amount %i instead of the list price', async amount => {
    const order: any = { id: 'o1', amountCents: 3000, currency: 'usd', status: 'PENDING', kind: 'MERCHANDISE', userId: null, occurrenceId: null, items: [], user: null };
    let record: any = null;
    const tx: any = { $executeRaw: async () => {},
      commerceOrder: { findUnique: async () => order, update: async ({ data }: any) => Object.assign(order, data) },
      commerceRefund: { findFirst: async () => null },
      paymentRecord: { findFirst: async () => null, create: async ({ data }: any) => { record = data; } },
    };
    await processStripeEvent(tx, event(amount));
    expect(order).toMatchObject({ amountCents: amount, paidAt: new Date('2026-09-15T12:00:00Z') });
    expect(record).toMatchObject({ amountCents: amount, currency: 'usd', occurredAt: new Date('2026-09-15T12:00:00Z') });
  });
  it('does not settle a linked order without a provider amount', async () => {
    const tx: any = { $executeRaw: async () => {}, commerceOrder: { findUnique: async () => ({ id: 'o1', status: 'PENDING' }), update: async () => ({ id: 'o1', kind: 'MERCHANDISE', items: [], amountCents: 3000 }) }, commerceRefund: { findFirst: async () => null }, paymentRecord: { findFirst: async () => null, create: async () => ({}) } };
    await expect(processStripeEvent(tx, event(null))).rejects.toThrow(/financial/i);
  });
  it('replays captured amount and charge date rather than a stale checkout quote', () => {
    const session = { id: 'cs1', created: paid - 86400, amount_total: 3000, currency: 'usd', payment_status: 'paid', metadata: { commerceOrderId: 'o1' } } as never;
    const charge = { id: 'ch1', created: paid, amount: 3000, amount_captured: 2000, currency: 'usd' } as never;
    expect(deriveStripeEventAction(syntheticCheckoutEvent(session, charge))).toMatchObject({ amountCents: 2000, currency: 'usd', occurredAt: new Date('2026-09-15T12:00:00Z') });
  });
});
