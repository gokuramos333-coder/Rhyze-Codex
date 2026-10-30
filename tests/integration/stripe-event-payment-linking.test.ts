import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { linkStripeEventPayment } from '@/lib/admin/stripe-event-payment-linking';

const url = process.env.CALLBACK_TEST_DATABASE_URL;
if (url && (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname) || new URL(url).pathname !== '/callback_test')) {
  throw new Error('External event payment tests require the explicit disposable local callback_test database');
}

describe.skipIf(!url)('external event Stripe payment linkage on PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const prefix = `event-link-${randomUUID()}`;
  const ids = { owner: `${prefix}-owner`, member: `${prefix}-member`, category: `${prefix}-category`, template: `${prefix}-template`, event: `${prefix}-event`, credit: `${prefix}-credit` };
  const piId = `pi_${randomUUID().replaceAll('-', '')}`;
  const chargeId = `ch_${randomUUID().replaceAll('-', '')}`;
  const now = new Date('2026-09-29T02:00:00Z');
  const input = { paymentIntentId: piId, userId: ids.member, occurrenceId: ids.event, amountCents: 3000, currency: 'usd' as const, markAttended: false, reason: 'Owner verified synthetic external receipt', actorId: ids.owner };
  function provider(paymentIntentId = piId, id = chargeId) {
    return {
      paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: paymentIntentId, livemode: true, status: 'succeeded', amount: 3000, amount_received: 3000, currency: 'usd', latest_charge: id, customer: null, metadata: {} }) },
      charges: { retrieve: vi.fn().mockResolvedValue({ id, payment_intent: paymentIntentId, livemode: true, paid: true, captured: true, status: 'succeeded', amount: 3000, amount_captured: 3000, amount_refunded: 0, refunded: false, disputed: false, currency: 'usd', created: Math.floor(now.getTime() / 1000) - 86400, billing_details: { email: `${ids.member}@example.test` }, customer: null, metadata: {}, receipt_url: null }) },
      refunds: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) }, disputes: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
      checkout: { sessions: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) } }, invoicePayments: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
    } as unknown as Stripe;
  }
  async function clearLinks() {
    await db.auditLog.deleteMany({ where: { actorId: ids.owner } });
    await db.attendanceRecord.deleteMany({ where: { userId: ids.member } });
    await db.paymentRecord.deleteMany({ where: { userId: ids.member } });
    await db.booking.deleteMany({ where: { userId: ids.member } });
    await db.commerceOrderItem.deleteMany({ where: { order: { userId: ids.member } } });
    await db.commerceOrder.deleteMany({ where: { userId: ids.member } });
  }
  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ids.owner, email: `${ids.owner}@example.test`, role: 'OWNER', status: 'ACTIVE' }, { id: ids.member, email: `${ids.member}@example.test`, name: 'Synthetic Member', role: 'MEMBER', status: 'ACTIVE' }] });
    await db.classCategory.create({ data: { id: ids.category, name: prefix, slug: prefix } });
    await db.classTemplate.create({ data: { id: ids.template, categoryId: ids.category, name: 'Synthetic event', slug: prefix, description: 'Integration fixture', durationMinutes: 60, defaultCapacity: 5, dropInPriceCents: 3000, isEvent: true, tags: [], equipment: [] } });
    await db.classOccurrence.create({ data: { id: ids.event, templateId: ids.template, startAt: new Date('2026-09-28T23:15:00Z'), endAt: new Date('2026-09-29T00:15:00Z'), capacity: 5, priceCents: 3000 } });
    await db.creditAccount.create({ data: { id: ids.credit, userId: ids.member, label: 'Unrelated paid classes', validFrom: new Date('2026-09-01T00:00:00Z'), entries: { create: { type: 'GRANT', quantity: 2, reason: 'Existing unrelated credits' } } } });
  });
  beforeEach(clearLinks);
  afterAll(async () => {
    await clearLinks();
    await db.creditLedgerEntry.deleteMany({ where: { creditAccountId: ids.credit } });
    await db.creditAccount.deleteMany({ where: { id: ids.credit } });
    await db.classOccurrence.deleteMany({ where: { id: ids.event } });
    await db.classTemplate.deleteMany({ where: { id: ids.template } });
    await db.classCategory.deleteMany({ where: { id: ids.category } });
    await db.user.deleteMany({ where: { id: { in: [ids.owner, ids.member] } } });
    await db.$disconnect();
  });
  async function expectCreditsUntouched() {
    const credits = await db.creditLedgerEntry.findMany({ where: { creditAccountId: ids.credit } });
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ type: 'GRANT', quantity: 2, bookingId: null });
  }
  it('serializes simultaneous same-payment requests into one complete financial chain', async () => {
    const results = await Promise.all([linkStripeEventPayment(db, provider(), input, now), linkStripeEventPayment(db, provider(), input, now)]);
    expect(results[0].orderId).toBe(results[1].orderId);
    expect(await db.commerceOrder.count({ where: { userId: ids.member } })).toBe(1);
    expect(await db.paymentRecord.count({ where: { userId: ids.member } })).toBe(1);
    expect(await db.booking.count({ where: { userId: ids.member } })).toBe(1);
    expect(await db.attendanceRecord.count({ where: { userId: ids.member } })).toBe(0);
    expect(await db.auditLog.count({ where: { actorId: ids.owner, action: 'payment.link-event' } })).toBe(1);
    await expectCreditsUntouched();
    const again = await linkStripeEventPayment(db, provider(), input, now);
    expect(again).toMatchObject({ alreadyLinked: true, orderId: results[0].orderId });
  });
  it('allows only one of two competing payments to claim the same member/event', async () => {
    const otherPi = `pi_${randomUUID().replaceAll('-', '')}`;
    const otherCharge = `ch_${randomUUID().replaceAll('-', '')}`;
    const results = await Promise.allSettled([linkStripeEventPayment(db, provider(), input, now), linkStripeEventPayment(db, provider(otherPi, otherCharge), { ...input, paymentIntentId: otherPi }, now)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await db.commerceOrder.count({ where: { userId: ids.member } })).toBe(1);
    expect(await db.paymentRecord.count({ where: { userId: ids.member } })).toBe(1);
    await expectCreditsUntouched();
  });
  it('rolls back all financial, booking, attendance and audit writes if the transaction fails after linking', async () => {
    const failing = new Proxy(db, { get(target, property) {
      if (property === '$transaction') return async (callback: (tx: any) => Promise<unknown>, options: any) => db.$transaction(async (tx) => { await callback(tx); throw new Error('injected commit failure'); }, options);
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    } });
    await expect(linkStripeEventPayment(failing, provider(), { ...input, markAttended: true }, now)).rejects.toThrow('injected commit failure');
    for (const count of [await db.commerceOrder.count({ where: { userId: ids.member } }), await db.paymentRecord.count({ where: { userId: ids.member } }), await db.booking.count({ where: { userId: ids.member } }), await db.attendanceRecord.count({ where: { userId: ids.member } }), await db.auditLog.count({ where: { actorId: ids.owner } })]) expect(count).toBe(0);
    await expectCreditsUntouched();
  });
  it('records explicit historical attendance once and preserves it on repeated calls', async () => {
    const first = await linkStripeEventPayment(db, provider(), { ...input, markAttended: true }, now);
    await linkStripeEventPayment(db, provider(), input, now);
    expect(await db.booking.findUnique({ where: { id: first.bookingId } })).toMatchObject({ status: 'ATTENDED', source: 'STRIPE_EVENT' });
    expect(await db.attendanceRecord.findMany({ where: { userId: ids.member } })).toMatchObject([{ bookingId: first.bookingId, occurrenceId: ids.event, status: 'ATTENDED', markedById: ids.owner }]);
    await expectCreditsUntouched();
  });
});
