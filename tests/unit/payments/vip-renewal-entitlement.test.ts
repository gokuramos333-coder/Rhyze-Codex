import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { vipMembershipPaidThrough } from '@/lib/domain/credits/vip-access';
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));

describe('VIP paid renewal entitlement through real webhook processing', () => {
  it('cannot extend through an unpaid subscription update, then restores only after a paid invoice', async () => {
    const firstEnd = new Date('2026-10-03T16:00Z');
    const nextEnd = new Date('2026-11-03T16:00Z');
    const now = new Date('2026-10-03T16:01Z');
    const account: any = { isUnlimited: true, validFrom: new Date('2026-09-03T16:00Z'), validUntil: firstEnd, entries: [] };
    const m: any = { id: 'member-plan', userId: 'member', purchaseId: 'purchase', status: 'ACTIVE', currentPeriodEnd: firstEnd,
      user: { id: 'member', name: 'Test Member', email: 'test@example.test' },
      product: { kind: 'VIP', name: 'VIP', billingInterval: 'MONTHLY', includedCredits: null, isUnlimited: true },
      purchase: { id: 'purchase', status: 'PAID', paidAt: new Date('2026-09-03T16:00Z'), creditAccount: account } };
    const paymentRecords = new Map<string, unknown>();
    const tx: any = {
      user: { findMany: async () => [] },
      $queryRaw: vi.fn(),
      purchase: { findUnique: async () => m.purchase, update: async ({ data }: any) => Object.assign(m.purchase, data) },
      membership: { findUnique: async () => m, update: async ({ data }: any) => Object.assign(m, data), updateMany: async ({ data }: any) => Object.assign(m, data) },
      // Monthly event credit already granted by maintenance in this renewal fixture.
      creditAccount: { findFirst: async () => ({ id: 'existing-monthly-event-benefit' }), upsert: async ({ update }: any) => Object.assign(account, update) },
      paymentRecord: { findUnique: async ({ where }: any) => paymentRecords.get(where.stripeInvoiceId), upsert: async ({ where, create, update }: any) => paymentRecords.set(where.stripeInvoiceId, paymentRecords.has(where.stripeInvoiceId) ? update : create) },
      inAppNotification: { create: vi.fn() },
    };
    const event = (type: string, object: any) => ({ id: `evt_${type}`, type, created: now.getTime() / 1000, data: { object } }) as Stripe.Event;
    const invoice = { id: 'in_next', subscription: 'sub_vip', status: 'paid', amount_due: 22200, amount_paid: 22200, currency: 'usd',
      lines: { data: [{ period: { start: firstEnd.getTime() / 1000, end: nextEnd.getTime() / 1000 } }] }, status_transitions: { paid_at: now.getTime() / 1000 + 1 } };
    expect(vipMembershipPaidThrough(m, now)).toBeNull();
    await processStripeEvent(tx, event('invoice.payment_failed', invoice));
    expect(m.status).toBe('PAST_DUE');
    expect(vipMembershipPaidThrough(m, now)).toBeNull();
    await processStripeEvent(tx, event('customer.subscription.updated', { id: 'sub_vip', status: 'active', current_period_start: firstEnd.getTime() / 1000, current_period_end: nextEnd.getTime() / 1000 }));
    expect(m.status).toBe('PAST_DUE');
    expect(vipMembershipPaidThrough(m, now)).toBeNull();
    await processStripeEvent(tx, event('invoice.paid', invoice));
    expect(vipMembershipPaidThrough(m, now)).toEqual(nextEnd);
    await processStripeEvent(tx, event('invoice.paid', invoice));
    expect(paymentRecords.size).toBe(1);
    expect(vipMembershipPaidThrough(m, nextEnd)).toBeNull();
  });
});
