import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { reconcileEventReview } from '@/lib/admin/reconcile-event-review';
const url = process.env.CALLBACK_TEST_DATABASE_URL;
if (url && (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/callback_test')) throw Error('Requires disposable local callback_test');
describe.skipIf(!url)('audited event review correction on PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const p = `review-${randomUUID()}`;
  const ids = { owner: `${p}-owner`, member: `${p}-member`, event: `${p}-event`, booking: `${p}-booking`, order: `${p}-order`, payment: `${p}-payment` };
  let input: Parameters<typeof reconcileEventReview>[2];
  function provider() {
    const metadata = { commerceOrderId: ids.order, userId: ids.member, occurrenceId: ids.event };
    return {
      accounts: { retrieve: vi.fn().mockResolvedValue({ id: 'acct_1Tu0UqRIYui0I7dP' }) },
      paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: 'pi_fixture', livemode: true, status: 'succeeded', amount: 3000, amount_received: 3000, currency: 'usd', latest_charge: 'ch_fixture', customer: 'cus_fixture' }) },
      checkout: { sessions: { retrieve: vi.fn().mockResolvedValue({ id: 'cs_fixture', livemode: true, mode: 'payment', status: 'complete', payment_status: 'paid', payment_intent: 'pi_fixture', amount_total: 3000, currency: 'usd', metadata, customer: 'cus_fixture' }) } },
      charges: { retrieve: vi.fn().mockResolvedValue({ id: 'ch_fixture', livemode: true, paid: true, captured: true, status: 'succeeded', payment_intent: 'pi_fixture', amount: 3000, amount_captured: 3000, currency: 'usd', refunded: false, disputed: false, amount_refunded: 0, customer: 'cus_fixture' }) },
      refunds: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
      disputes: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
    };
  }
  const run = (s = provider(), changes: Partial<typeof input> = {}, client: PrismaClient = db) => reconcileEventReview(client, s as unknown as Stripe, { ...input, ...changes });
  async function clean() {
    await db.auditLog.deleteMany({ where: { entityId: ids.order } });
    await db.commerceRefund.deleteMany({ where: { commerceOrderId: ids.order } });
    await db.paymentRecord.deleteMany({ where: { commerceOrderId: ids.order } });
    await db.commerceOrder.deleteMany({ where: { id: ids.order } });
    await db.attendanceRecord.deleteMany({ where: { bookingId: ids.booking } });
    await db.booking.deleteMany({ where: { id: ids.booking } });
    await db.classOccurrence.deleteMany({ where: { id: ids.event } });
    await db.classTemplate.deleteMany({ where: { id: p } }); await db.classCategory.deleteMany({ where: { id: p } });
    await db.user.deleteMany({ where: { id: { in: [ids.owner, ids.member] } } });
  }
  beforeEach(async () => {
    await clean();
    await db.user.createMany({ data: [{ id: ids.owner, email: 'automation-admin@rhyze.local', role: 'OWNER' }, { id: ids.member, email: `${p}@example.test` }] });
    await db.classCategory.create({ data: { id: p, name: p, slug: p } });
    await db.classTemplate.create({ data: { id: p, categoryId: p, name: p, slug: p, description: 'Synthetic', durationMinutes: 60, defaultCapacity: 1, isEvent: true } });
    await db.classOccurrence.create({ data: { id: ids.event, templateId: p, capacity: 1, startAt: new Date('2026-10-23T23:00:00Z'), endAt: new Date('2026-10-24T00:00:00Z') } });
    const booking = await db.booking.create({ data: { id: ids.booking, userId: ids.member, occurrenceId: ids.event, source: 'STRIPE_EVENT' } });
    await db.attendanceRecord.create({ data: { bookingId: ids.booking, occurrenceId: ids.event, userId: ids.member, status: 'CHECKED_IN', markedById: ids.owner } });
    const order = await db.commerceOrder.create({ data: { id: ids.order, userId: ids.member, occurrenceId: ids.event, kind: 'EVENT', status: 'FULFILLMENT_REVIEW', amountCents: 3000, stripePaymentIntentId: 'pi_fixture', stripeCheckoutSessionId: 'cs_fixture', paidAt: new Date('2026-10-23T02:24:40Z') } });
    await db.paymentRecord.create({ data: { id: ids.payment, userId: ids.member, commerceOrderId: ids.order, kind: 'EVENT', status: 'SUCCEEDED', amountCents: 3000, stripePaymentIntentId: 'pi_fixture', stripeEventId: `${p}-signed-receipt` } });
    input = { orderId: ids.order, bookingId: ids.booking, actorId: ids.owner, orderUpdatedAt: order.updatedAt.toISOString(), bookingUpdatedAt: booking.updatedAt.toISOString(), reason: 'Correct proven existing paid booking review flag', confirmation: 'RECONCILE', dryRun: false };
  });
  afterAll(async () => { await clean(); await db.$disconnect(); });
  async function unaffected() {
    return { booking: await db.booking.findUnique({ where: { id: ids.booking }, include: { attendance: true } }),
      payments: await db.paymentRecord.findMany({ where: { commerceOrderId: ids.order } }),
      event: await db.classOccurrence.findUnique({ where: { id: ids.event } }),
      credits: await db.creditLedgerEntry.count({ where: { bookingId: ids.booking } }),
      email: await db.emailMessage.count({ where: { userId: ids.member } }),
      refunds: await db.commerceRefund.count({ where: { commerceOrderId: ids.order } }) };
  }
  it('previews read-only, then changes only order status and one audit; duplicate is a no-op', async () => {
    const before = await unaffected(); const order = await db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } });
    expect(await run(undefined, { dryRun: true })).toMatchObject({ eligible: true, dryRun: true });
    expect(await db.commerceOrder.findUnique({ where: { id: ids.order } })).toEqual(order);
    expect(await db.auditLog.count({ where: { entityId: ids.order } })).toBe(0);
    expect(await run()).toMatchObject({ status: 'PAID', alreadyApplied: false });
    const after = await db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } });
    expect({ ...after, status: order.status, updatedAt: order.updatedAt }).toEqual(order);
    expect(await unaffected()).toEqual(before);
    expect(await run()).toMatchObject({ alreadyApplied: true });
    expect(await db.auditLog.count({ where: { entityId: ids.order } })).toBe(1);
  });
  it('serializes concurrent identical requests into one audit', async () => {
    const result = await Promise.all([run(), run()]);
    expect(result.filter(r => r.alreadyApplied === false)).toHaveLength(1);
    expect(await db.auditLog.count({ where: { entityId: ids.order } })).toBe(1);
  });
  it.each(['mode', 'account', 'amount', 'metadata', 'refund', 'dispute'] as const)('rejects wrong provider %s without writes', async field => {
    const s = provider();
    if (field === 'mode') s.paymentIntents.retrieve.mockResolvedValueOnce({ ...(await s.paymentIntents.retrieve()), livemode: false });
    if (field === 'account') s.accounts.retrieve.mockResolvedValueOnce({ id: 'acct_wrong' });
    if (field === 'amount') s.charges.retrieve.mockResolvedValueOnce({ ...(await s.charges.retrieve()), amount: 2999 });
    if (field === 'metadata') s.checkout.sessions.retrieve.mockResolvedValueOnce({ ...(await s.checkout.sessions.retrieve()), metadata: { commerceOrderId: 'wrong' } });
    if (field === 'refund') s.refunds.list.mockResolvedValueOnce({ data: [{ status: 'pending' }], has_more: false });
    if (field === 'dispute') s.disputes.list.mockResolvedValueOnce({ data: [{ id: 'dp_fixture' }], has_more: false });
    await expect(run(s)).rejects.toThrow('proof');
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } })).status).toBe('FULFILLMENT_REVIEW');
  });
  it.each(['actor', 'order-version', 'booking-version', 'cancelled-booking', 'cancelled-event', 'refund', 'payment'] as const)('rejects changed %s state', async field => {
    if (field === 'actor') input.actorId = ids.member;
    if (field === 'order-version') input.orderUpdatedAt = new Date(0).toISOString();
    if (field === 'booking-version') input.bookingUpdatedAt = new Date(0).toISOString();
    if (field === 'cancelled-booking') await db.booking.update({ where: { id: ids.booking }, data: { status: 'CANCELLED' } });
    if (field === 'cancelled-event') await db.classOccurrence.update({ where: { id: ids.event }, data: { status: 'CANCELLED' } });
    if (field === 'refund') await db.commerceRefund.create({ data: { commerceOrderId: ids.order, amountCents: 3000, status: 'PENDING' } });
    if (field === 'payment') await db.paymentRecord.update({ where: { id: ids.payment }, data: { amountCents: 1000 } });
    await expect(run()).rejects.toThrow('proof');
    expect(await db.auditLog.count({ where: { entityId: ids.order } })).toBe(0);
  });
  it.each(['cancellation', 'refund'] as const)('rejects a concurrent %s committed during provider verification', async change => {
    const s = provider(); const charge = await s.charges.retrieve();
    s.charges.retrieve.mockImplementationOnce(async () => {
      if (change === 'cancellation') await db.booking.update({ where: { id: ids.booking }, data: { status: 'CANCELLED' } });
      else await db.commerceRefund.create({ data: { commerceOrderId: ids.order, amountCents: 3000, status: 'PENDING' } });
      return charge;
    });
    await expect(run(s)).rejects.toThrow('proof');
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } })).status).toBe('FULFILLMENT_REVIEW');
    expect(await db.auditLog.count({ where: { entityId: ids.order } })).toBe(0);
  });
  it('rolls back the status update if writing the audit fails', async () => {
    const client = { commerceOrder: db.commerceOrder, $transaction: (fn: any, options: any) => db.$transaction(tx => fn(new Proxy(tx, { get(target, prop) {
      if (prop === 'auditLog') return { ...target.auditLog, create: async () => { throw Error('simulated audit storage failure'); } };
      return target[prop as keyof typeof target];
    } })), options) } as unknown as PrismaClient;
    await expect(run(undefined, {}, client)).rejects.toThrow('simulated audit');
    expect((await db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } })).status).toBe('FULFILLMENT_REVIEW');
  });
});
