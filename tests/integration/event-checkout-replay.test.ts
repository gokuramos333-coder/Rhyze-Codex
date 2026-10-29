import { cancelOccurrencesWithNotifications } from '@/lib/domain/schedule/management-cancellation';
import { lockOccurrenceWrites, lockOrderWrites, lockBookingWrites } from '@/lib/domain/bookings/write-fence';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
import { cancelLowAttendanceOccurrences } from '@/lib/domain/schedule/low-attendance-cancellations';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { processStripeEvent } from '@/lib/payments/webhook-processor';

import { syncRecentStripePaymentRecords } from '@/lib/payments/stripe-payment-sync';
const provider = vi.hoisted(() => ({ charges: vi.fn(), sessions: vi.fn() }));
vi.mock('@/lib/payments/stripe', async () => ({
  stripeIsConfigured: () => true, stripeAccountMode: () => 'test',
  getStripe: () => ({ webhooks: Stripe.webhooks, accounts: { retrieve: async () => ({ id: 'acct_fixture' }) },
    charges: { list: provider.charges }, checkout: { sessions: { list: provider.sessions } },
    refunds: { list: async () => ({ data: [], has_more: false }) },
    disputes: { list: async () => ({ data: [], has_more: false }) },
  }),
}));

vi.mock('@/lib/payments/stripe-receipt-refresh', async actual => ({
  ...(await actual<object>()), refreshStripeEventReceipt: async () => {},
}));
import { POST as webhookPOST } from '@/app/api/stripe/webhook/route';

const actionState = vi.hoisted(() => ({ db: null as any, actor: null as any }));
vi.mock('@/lib/db/prisma', () => ({ get prisma() { return actionState.db; } }));
vi.mock('@/lib/auth/session', () => ({ requireActiveUser: async () => actionState.actor, requireArea: async () => actionState.actor, requireApprovedOwner: async () => actionState.actor }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import { markAttendanceAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/roster/actions';
import { cancelAssignedClassAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/message/actions';

const url = process.env.CALLBACK_TEST_DATABASE_URL;
if (url && (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/callback_test')) {
  throw Error('Event replay tests require disposable local callback_test');
}
describe.skipIf(!url)('event checkout replay on PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const prefix = `event-replay-${randomUUID()}`;
  const occurrenceId = `${prefix}-occurrence`;
  const userId = `${prefix}-member`;
  const orderId = `${prefix}-order`;
  const bookingId = `${prefix}-booking`;
  const where = { startsWith: prefix };
  const event = (id: string, order = orderId): Stripe.Event => ({
    id: `${prefix}-${id}`, type: 'checkout.session.completed', livemode: false, created: 1792722280,
    data: { object: { id: `cs_${order}`, payment_status: 'paid', payment_intent: `pi_${order}`,
      amount_total: 3000, currency: 'usd', metadata: { commerceOrderId: order } } },
  }) as unknown as Stripe.Event;
  const process = (value: Stripe.Event) => db.$transaction(tx => processStripeEvent(tx, value), { timeout: 15000 });
  async function clean() {
    await db.classMessage.deleteMany({ where: { occurrenceId } });
    await db.stripeEvent.deleteMany({ where: { id: { contains: prefix } } });
    await db.auditLog.deleteMany({ where: { entityId: occurrenceId } });
    await db.inAppNotification.deleteMany({ where: { userId: where } });
    await db.emailMessage.deleteMany({ where: { dedupeKey: { contains: prefix } } });
    await db.commerceRefund.deleteMany({ where: { commerceOrderId: where } });
    await db.paymentRecord.deleteMany({ where: { commerceOrderId: where } });
    await db.attendanceRecord.deleteMany({ where: { occurrenceId } });
    await db.waitlistEntry.deleteMany({ where: { occurrenceId } });
    await db.booking.deleteMany({ where: { occurrenceId } });
    await db.commerceOrder.deleteMany({ where: { id: where } });
    await db.classOccurrence.deleteMany({ where: { id: occurrenceId } });
    await db.classTemplate.deleteMany({ where: { id: prefix } });
    await db.classCategory.deleteMany({ where: { id: prefix } });
    await db.user.deleteMany({ where: { id: where } });
  }
  beforeEach(async () => {
    await clean();
    actionState.db = db; actionState.actor = { id: userId, role: 'OWNER', status: 'ACTIVE' };
    await db.user.create({ data: { id: userId, email: `${userId}@example.test` } });
    await db.classCategory.create({ data: { id: prefix, slug: prefix, name: 'Synthetic' } });
    await db.classTemplate.create({ data: { id: prefix, categoryId: prefix, slug: prefix, name: 'Synthetic event', description: 'Test only', durationMinutes: 60, defaultCapacity: 1, isEvent: true } });
    await db.classOccurrence.create({ data: { id: occurrenceId, templateId: prefix, capacity: 1, startAt: new Date('2026-10-23T23:00:00Z'), endAt: new Date('2026-10-24T00:00:00Z') } });
    await db.commerceOrder.create({ data: { id: orderId, userId, occurrenceId, kind: 'EVENT', status: 'PAID', amountCents: 3000, currency: 'usd', stripeCheckoutSessionId: `cs_${orderId}`, stripePaymentIntentId: `pi_${orderId}`, paidAt: new Date('2026-10-23T02:24:40Z') } });
    await db.booking.create({ data: { id: bookingId, userId, occurrenceId, source: 'STRIPE_EVENT' } });
  });
  afterAll(async () => { await clean(); await db.$disconnect(); });
  const order = () => db.commerceOrder.findUniqueOrThrow({ where: { id: orderId } });
  const booking = () => db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  it.each(['PAID', 'FULFILLMENT_REVIEW'] as const)('preserves an existing confirmed last seat from %s through distinct synthetic and duplicate replays', async status => {
    await db.commerceOrder.update({ where: { id: orderId }, data: { status } });
    const before = await booking();
    await process(event('original'));
    await process(event('synthetic'));
    await process(event('synthetic'));
    expect((await order()).status).toBe('PAID');
    expect(await booking()).toEqual(before);
    expect(await db.paymentRecord.count({ where: { commerceOrderId: orderId } })).toBe(1);
    expect(await db.emailMessage.count({ where: { dedupeKey: { contains: orderId } } })).toBe(3);
  });
  it.each(['new-seat', 'existing-seat'] as const)('preserves waitlist completion for %s through replay', async state => {
    if (state === 'new-seat') await db.booking.delete({ where: { id: bookingId } });
    const waiting = await db.waitlistEntry.create({ data: { occurrenceId, userId } });
    await process(event('waitlist-first'));
    const first = await db.waitlistEntry.findUniqueOrThrow({ where: { id: waiting.id } });
    expect(first.status).toBe('PROMOTED');
    expect(first.promotedAt).not.toBeNull();
    await process(event('waitlist-replay'));
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: waiting.id } })).toEqual(first);
    expect((await order()).status).toBe('PAID');
    expect(await db.booking.count({ where: { occurrenceId } })).toBe(1);
  });
  it('does not remove a waiting customer when capacity prevents checkout fulfillment', async () => {
    await db.booking.delete({ where: { id: bookingId } });
    await db.classOccurrence.update({ where: { id: occurrenceId }, data: { historicalSignupCount: 1 } });
    const waiting = await db.waitlistEntry.create({ data: { occurrenceId, userId } });
    await process(event('waitlist-full'));
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe('WAITING');
    expect((await order()).status).toBe('FULFILLMENT_REVIEW');
  });
  it('preserves attended fulfillment on a completed event', async () => {
    await db.classOccurrence.update({ where: { id: occurrenceId }, data: { status: 'COMPLETED', capacity: 2 } });
    await db.booking.update({ where: { id: bookingId }, data: { status: 'ATTENDED' } });
    const before = await booking();
    await process(event('attended'));
    expect((await order()).status).toBe('PAID');
    expect(await booking()).toEqual(before);
  });
  it('preserves attended fulfillment and attendance history on a completed event replay', async () => {
    await db.classOccurrence.update({ where: { id: occurrenceId }, data: { status: 'COMPLETED' } });
    await db.booking.update({ where: { id: bookingId }, data: { status: 'ATTENDED' } });
    await db.attendanceRecord.create({ data: { bookingId, userId, occurrenceId, status: 'ATTENDED' } });
    const before = await booking();
    const attendance = await db.attendanceRecord.findUniqueOrThrow({ where: { bookingId } });
    await process(event('attended'));
    expect((await order()).status).toBe('PAID');
    expect(await booking()).toEqual(before);
    expect(await db.attendanceRecord.findUniqueOrThrow({ where: { bookingId } })).toEqual(attendance);
  });
  it('preserves existing fulfillment after capacity is reduced below booked count', async () => {
    await db.classOccurrence.update({ where: { id: occurrenceId }, data: { capacity: 0 } });
    await process(event('reduced'));
    expect((await order()).status).toBe('PAID');
  });
  it('does not touch confirmed booking source or timestamps when capacity is available', async () => {
    await db.classOccurrence.update({ where: { id: occurrenceId }, data: { capacity: 2 } });
    await db.booking.update({ where: { id: bookingId }, data: { source: 'ADMIN_ADDED' } });
    const before = await booking();
    await process(event('space'));
    expect(await booking()).toEqual(before);
  });
  it('keeps a new customer at historical capacity in review without a seat', async () => {
    await db.booking.delete({ where: { id: bookingId } });
    await db.classOccurrence.update({ where: { id: occurrenceId }, data: { historicalSignupCount: 1 } });
    await process(event('full'));
    expect((await order()).status).toBe('FULFILLMENT_REVIEW');
    expect(await db.booking.count({ where: { occurrenceId } })).toBe(0);
  });
  it('does not revive a cancelled booking when a paid checkout is replayed', async () => {
    await db.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    const before = await booking();
    await process(event('cancelled'));
    expect(await booking()).toEqual(before);
    expect((await order()).status).toBe('FULFILLMENT_REVIEW');
  });
  it('does not create a seat for a cancelled occurrence', async () => {
    await db.booking.delete({ where: { id: bookingId } });
    await db.classOccurrence.update({ where: { id: occurrenceId }, data: { status: 'CANCELLED' } });
    await process(event('cancelled-occurrence'));
    expect(await db.booking.count({ where: { occurrenceId } })).toBe(0);
    expect((await order()).status).toBe('FULFILLMENT_REVIEW');
  });
  it.each(['REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'] as const)('retains %s order and cancelled booking', async status => {
    await db.commerceOrder.update({ where: { id: orderId }, data: { status } });
    await db.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    const before = await booking();
    await process(event(status));
    expect((await order()).status).toBe(status);
    expect(await booking()).toEqual(before);
    expect(await db.paymentRecord.count({ where: { commerceOrderId: orderId } })).toBe(0);
  });
  it.each(['PENDING', 'SUCCEEDED'] as const)('does not process checkout over a %s refund', async status => {
    await db.commerceRefund.create({ data: { commerceOrderId: orderId, bookingId, amountCents: 3000,
      reason: 'Synthetic guard fixture', status, operationKey: `${prefix}-refund`, actorId: userId } });
    const before = await booking();
    const orderBefore = await order();
    await process(event(`refund-${status}`));
    expect(await booking()).toEqual(before);
    expect(await order()).toEqual(orderBefore);
    expect(await db.paymentRecord.count({ where: { commerceOrderId: orderId } })).toBe(0);
  });
  it('allocates at most one last seat to concurrent different-customer checkouts', async () => {
    await db.booking.delete({ where: { id: bookingId } });
    const second = `${prefix}-second`;
    await db.user.create({ data: { id: second, email: `${second}@example.test` } });
    await db.commerceOrder.create({ data: { id: second, userId: second, occurrenceId, kind: 'EVENT', amountCents: 3000 } });
    // Delay after the real count so unlocked handlers both observe the last seat.
    const racingProcess = (value: Stripe.Event) => db.$transaction(async tx => {
      const delayed = new Proxy(tx, { get(target, property) {
        if (property !== 'booking') return Reflect.get(target, property);
        return new Proxy(target.booking, { get(model, method) {
          if (method !== 'count') return Reflect.get(model, method);
          return async (...args: Parameters<typeof model.count>) => {
            const count = await model.count(...args);
            await new Promise(resolve => setTimeout(resolve, 100));
            return count;
          };
        } });
      } });
      await processStripeEvent(delayed, value);
    }, { timeout: 15000 });
    await Promise.all([racingProcess(event('race-1')), racingProcess(event('race-2', second))]);
    expect(await db.booking.count({ where: { occurrenceId, status: 'CONFIRMED' } })).toBe(1);
    const statuses = (await db.commerceOrder.findMany({ where: { occurrenceId } })).map(x => x.status).sort();
    expect(statuses).toEqual(['FULFILLMENT_REVIEW', 'PAID']);
    expect(await db.paymentRecord.count({ where: { commerceOrderId: where } })).toBe(2);
  });
  it('does not allocate an attended customer’s seat to a new checkout', async () => {
    await db.booking.delete({ where: { id: bookingId } });
    const second = `${prefix}-attended-member`;
    await db.user.create({ data: { id: second, email: `${second}@example.test` } });
    await db.booking.create({ data: { userId: second, occurrenceId, status: 'ATTENDED' } });
    await process(event('attended-capacity'));
    expect((await order()).status).toBe('FULFILLMENT_REVIEW');
    expect(await db.booking.count({ where: { occurrenceId } })).toBe(1);
  });
  it.each(['member cancellation', 'refund preparation', 'refund finalization', 'management cancellation'] as const)(
    'retries a prior webhook snapshot after %s commits without reviving state', async writer => {
      await process(event('initial'));
      const paymentBefore = await db.paymentRecord.findFirstOrThrow({ where: { commerceOrderId: orderId } });
      let snapshots = 0;
      let taken!: () => void;
      const snapshot = new Promise<void>(resolve => { taken = resolve; });
      let done!: () => void;
      const committed = new Promise<void>(resolve => { done = resolve; });
      const replay = retrySerializableTransaction(() => db.$transaction(async tx => {
        await tx.commerceOrder.findUniqueOrThrow({ where: { id: orderId } });
        if (++snapshots === 1) { taken(); await committed; }
        await processStripeEvent(tx, event('concurrent-replay'));
      }, { isolationLevel: 'Serializable', timeout: 15000 }));
      await snapshot;
      if (writer === 'management cancellation') {
        await cancelOccurrencesWithNotifications(db, userId, [occurrenceId], 'Synthetic cancellation');
      } else await db.$transaction(async tx => {
        if (writer !== 'member cancellation') await lockOrderWrites(tx, orderId);
        await lockBookingWrites(tx, bookingId);
        if (writer === 'member cancellation') {
          await tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
        } else {
          await tx.commerceRefund.create({ data: { commerceOrderId: orderId, bookingId, actorId: userId, operationKey: `${prefix}-concurrent-refund`, reason: 'Synthetic', amountCents: 3000, status: writer === 'refund preparation' ? 'PENDING' : 'SUCCEEDED' } });
          if (writer === 'refund finalization') {
            await tx.commerceOrder.update({ where: { id: orderId }, data: { status: 'REFUNDED', refundedAmountCents: 3000 } });
            await tx.paymentRecord.update({ where: { id: paymentBefore.id }, data: { status: 'REFUNDED', refundedAmountCents: 3000 } });
            await tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
          }
        }
      });
      const bookingBefore = await booking();
      const orderBefore = await order();
      const refundBefore = await db.commerceRefund.findMany({ where: { commerceOrderId: orderId } });
      done(); await replay;
      expect(snapshots).toBeGreaterThanOrEqual(2);
      expect(await booking()).toEqual(bookingBefore);
      expect(await db.commerceRefund.findMany({ where: { commerceOrderId: orderId } })).toEqual(refundBefore);
      if (writer.startsWith('refund')) {
        expect(await order()).toEqual(orderBefore);
        expect(await db.paymentRecord.findUniqueOrThrow({ where: { id: paymentBefore.id } })).toMatchObject({ status: writer === 'refund finalization' ? 'REFUNDED' : 'SUCCEEDED', refundedAmountCents: writer === 'refund finalization' ? 3000 : 0 });
      } else expect((await order()).status).toBe('FULFILLMENT_REVIEW');
    },
  );
  it('automatic cancellation cannot cancel an event while checkout commits its first seat', async () => {
    await db.booking.delete({ where: { id: bookingId } });
    let allocated!: () => void;
    const holding = new Promise<void>(resolve => { allocated = resolve; });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const checkout = db.$transaction(async tx => {
      await processStripeEvent(tx, event('first-seat'));
      allocated(); await gate;
    }, { timeout: 15000 });
    await holding;
    const cancel = cancelLowAttendanceOccurrences(db, new Date('2026-10-23T22:00:00Z'));
    // Wait for the actual competing backend to block, not an arbitrary sleep.
    try {
      let blocked = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        const rows = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
        if (Number(rows[0].count) > 0) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      expect(blocked).toBe(true);
    } finally { release(); }
    await checkout; await cancel;
    expect((await db.classOccurrence.findUniqueOrThrow({ where: { id: occurrenceId } })).status).toBe('SCHEDULED');
    expect(await db.booking.count({ where: { occurrenceId, status: 'CONFIRMED' } })).toBe(1);
  });
  it('scheduled sync cannot erase a refund committed after its provider and payment snapshot', async () => {
    await process(event('initial'));
    // Force reconciliation rather than the already-matching fast path.
    await db.paymentRecord.updateMany({ where: { commerceOrderId: orderId }, data: { occurredAt: new Date(0) } });
    provider.charges.mockResolvedValue({ data: [{ id: `ch_${prefix}`, paid: true, captured: true, status: 'succeeded', livemode: true, amount: 3000, amount_captured: 3000, amount_refunded: 0, currency: 'usd', created: 1792722280, payment_intent: `pi_${orderId}`, metadata: {}, refunds: { data: [] } }], has_more: false });
    provider.sessions.mockImplementation(async () => {
      await db.$transaction(async tx => {
        await lockOrderWrites(tx, orderId);
        await lockBookingWrites(tx, bookingId);
        await tx.commerceOrder.update({ where: { id: orderId }, data: { status: 'REFUNDED', refundedAmountCents: 3000 } });
        await tx.paymentRecord.updateMany({ where: { commerceOrderId: orderId }, data: { status: 'REFUNDED', refundedAmountCents: 3000 } });
        await tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
      });
      return { data: [event('sync').data.object] };
    });
    await syncRecentStripePaymentRecords(db, { financialOnly: false });
    expect(await db.paymentRecord.findFirstOrThrow({ where: { commerceOrderId: orderId } })).toMatchObject({ status: 'REFUNDED', refundedAmountCents: 3000 });
    expect((await order()).status).toBe('REFUNDED');
    expect((await booking()).status).toBe('CANCELLED');
  });
  it('attendance clearing cannot restore a no-show into an already full event', async () => {
    await db.booking.update({ where: { id: bookingId }, data: { status: 'NO_SHOW' } });
    await db.attendanceRecord.create({ data: { bookingId, userId, occurrenceId, status: 'NO_SHOW' } });
    const second = `${prefix}-occupant`;
    await db.user.create({ data: { id: second, email: `${second}@example.test` } });
    await db.booking.create({ data: { occurrenceId, userId: second } });
    const form = new FormData(); form.set('bookingId', bookingId); form.set('occurrenceId', occurrenceId); form.set('status', 'NO_SHOW');
    await markAttendanceAction(form).catch(() => {});
    expect((await booking()).status).toBe('NO_SHOW');
    expect(await db.booking.count({ where: { occurrenceId, status: 'CONFIRMED' } })).toBe(1);
  });
  it('assigned instructor cancellation reads the roster after the transaction begins', async () => {
    await db.booking.delete({ where: { id: bookingId } });
    await db.classOccurrence.update({ where: { id: occurrenceId }, data: { instructorId: userId } });
    const original = db.$transaction.bind(db) as any;
    let injected = false;
    actionState.db = new Proxy(db, { get(target, key) {
      if (key !== '$transaction') return Reflect.get(target, key);
      return async (fn: any, options: any) => {
        if (!injected) { injected = true; await process(event('before-instructor-cancel')); }
        return original(fn, options);
      };
    } });
    const form = new FormData(); form.set('occurrenceId', occurrenceId); form.set('customCancellationReason', 'Synthetic instructor cancellation');
    await expect(cancelAssignedClassAction(form)).rejects.toThrow('redirect:/instructor/schedule?cancelled=1');
    expect(await db.booking.count({ where: { occurrenceId, status: 'CONFIRMED' } })).toBe(0);
  });
  it('signed concurrent and duplicate webhook deliveries commit the real StripeEvent gate once', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_disposable_fixture');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_disposable_fixture');
    const body = JSON.stringify(event('route'));
    const send = () => webhookPOST(new Request('http://localhost/api/stripe/webhook', { method: 'POST', body, headers: { 'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload: body, secret: 'whsec_disposable_fixture' }) } }));
    try {
      const responses = await Promise.all([send(), send()]);
      expect(responses.map(r => r.status)).toEqual([200, 200]);
      const receipt = await db.stripeEvent.findUniqueOrThrow({ where: { id: `${prefix}-route` } });
      expect(receipt.processedAt).not.toBeNull();
      const payment = await db.paymentRecord.findFirstOrThrow({ where: { commerceOrderId: orderId } });
      expect((await send()).status).toBe(200);
      expect(await db.stripeEvent.findUniqueOrThrow({ where: { id: receipt.id } })).toEqual(receipt);
      expect(await db.paymentRecord.findMany({ where: { commerceOrderId: orderId } })).toEqual([payment]);
      expect(await db.emailMessage.count({ where: { dedupeKey: { contains: orderId } } })).toBe(3);
    } finally { vi.unstubAllEnvs(); }
  });
  it('management cancellation includes a checkout committed after the request roster read', async () => {
    await db.booking.delete({ where: { id: bookingId } });
    // Pause at the transaction boundary, after any unsafe outside roster read.
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    let resume!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const delayed = new Proxy(db, { get(target, key) {
      if (key !== '$transaction') return Reflect.get(target, key);
      return async (fn: Parameters<typeof db.$transaction>[0]) => {
        entered(); await gate;
        return db.$transaction(fn);
      };
    } });
    const cancellation = cancelOccurrencesWithNotifications(delayed, userId, [occurrenceId], 'Synthetic cancellation');
    await waiting;
    await process(event('before-cancellation'));
    resume(); await cancellation;
    expect((await db.classOccurrence.findUniqueOrThrow({ where: { id: occurrenceId } })).status).toBe('CANCELLED');
    expect(await db.booking.count({ where: { occurrenceId, status: 'CONFIRMED' } })).toBe(0);
  });
  it('mixed-isolation last-seat invariant with a prior webhook snapshot', async () => {
    await db.booking.delete({ where: { id: bookingId } });
    const second = `${prefix}-mixed-member`;
    await db.user.create({ data: { id: second, email: `${second}@example.test` } });
    let locked!: () => void;
    const holding = new Promise<void>(resolve => { locked = resolve; });
    let snapshotTaken!: () => void;
    const snapshot = new Promise<void>(resolve => { snapshotTaken = resolve; });
    const member = db.$transaction(async tx => {
      await lockOccurrenceWrites(tx, occurrenceId);
      locked();
      await snapshot;
      await tx.booking.create({ data: { occurrenceId, userId: second, source: 'MEMBER' } });
    }, { timeout: 15000 });
    await holding;
    await retrySerializableTransaction(() => db.$transaction(async tx => {
      await tx.commerceOrder.findUniqueOrThrow({ where: { id: orderId } });
      snapshotTaken();
      await member;
      await processStripeEvent(tx, event('mixed-webhook'));
    }, { isolationLevel: 'Serializable', timeout: 15000 }));
    expect(await db.booking.count({ where: { occurrenceId, status: 'CONFIRMED' } })).toBe(1);
  });

});
