import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ db: null as any, actor: null as any, queue: vi.fn(), charge: vi.fn(), refund: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('@/lib/auth/session', () => ({ requireArea: async () => mocks.actor, requireActiveUser: async () => ({ ...mocks.actor, role: 'OWNER' }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw Error(url); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: mocks.queue }));
vi.mock('@/lib/payments/attendance-fee', () => ({ chargeAttendanceFee: mocks.charge, refundAttendanceFee: mocks.refund }));
import { bookOccurrenceAction, cancelBookingAction } from '@/app/(portal)/member/bookings/actions';
import { markAttendanceAction, restoreCreditAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/roster/actions';
import { requestMembershipChangeAction } from '@/app/(portal)/member/membership/actions';
import { transferBookingAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/transfers/actions';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
import { kellyTestDatabase, assertKellyTestDatabaseIdentity } from '@/scripts/release/kelly-test-database';
const database = kellyTestDatabase(process.env);
const url = database.url;
const db = new PrismaClient({ datasourceUrl: url }); mocks.db = db;
const start = new Date('2026-10-06T22:09:25Z'), end = new Date('2026-11-06T22:09:25Z'), next = new Date('2026-12-06T22:09:25Z');
const now = new Date('2026-11-03T20:00Z');
const form = (values: Record<string,string>) => { const f = new FormData(); for (const [k,v] of Object.entries(values)) f.set(k,v); return f; };
afterEach(() => vi.useRealTimers()); afterAll(() => db.$disconnect());
beforeAll(async () => {
  const identity = await db.$queryRaw<{ name: string; address: string; port: number; directory: string }[]>`
    SELECT current_database() AS name, host(inet_server_addr()) AS address,
      inet_server_port() AS port, current_setting('data_directory') AS directory`;
  assertKellyTestDatabaseIdentity(database, identity);
});
async function fixture() {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  const id = `kelly-test-${randomUUID()}`;
  const user = await db.user.create({ data: { id, email: `${id}@example.test`, status: 'ACTIVE' } }); mocks.actor = user;
  const product = await db.product.create({ data: { id, slug: id, name: 'Synthetic paid VIP', description: 'Synthetic only', kind: 'VIP', priceCents: 19900, billingInterval: 'MONTHLY', isUnlimited: true, eligibleCategoryIds: [] } });
  await db.purchase.create({ data: { id, userId: id, productId: id, status: 'PAID', paidAt: start, amountCents: 19900 } });
  await db.membership.create({ data: { id, userId: id, productId: id, purchaseId: id, status: 'ACTIVE', stripeSubscriptionId: id, currentPeriodStart: start, currentPeriodEnd: end } });
  const account = await db.creditAccount.create({ data: { userId: id, sourcePurchaseId: id, label: 'Synthetic VIP', isUnlimited: true, validFrom: start, validUntil: end } });
  const waiver = await db.waiverVersion.upsert({ where: { version: 900001 }, update: {}, create: { version: 900001, title: 'Synthetic', body: 'Synthetic only', effectiveAt: start, isActive: true } });
  await db.waiverAcceptance.create({ data: { userId: id, waiverVersionId: waiver.id, signedDate: start } });
  const category = await db.classCategory.create({ data: { name: 'Synthetic', slug: id } });
  const template = await db.classTemplate.create({ data: { categoryId: category.id, slug: id, name: 'Synthetic Saturday', description: 'Synthetic only', durationMinutes: 50, defaultCapacity: 25, tags: [], equipment: [] } });
  async function occurrence(date = '2026-11-07T16:00Z') { const at = new Date(date); return db.classOccurrence.create({ data: { templateId: template.id, startAt: at, endAt: new Date(+at + 3000000), capacity: 25 } }); }
  const saturday = await occurrence();
  async function book(target = saturday) {
    await expect(bookOccurrenceAction(form({ occurrenceId: target.id }))).rejects.toThrow('result=confirmed');
    return db.booking.findUniqueOrThrow({ where: { occurrenceId_userId: { occurrenceId: target.id, userId: id } } });
  }
  const invoice = (suffix: string, from = end, through = next) => ({ id: `${id}-${suffix}`, subscription: id, status: 'paid', amount_paid: 19900, amount_due: 19900, currency: 'usd', status_transitions: { paid_at: +from / 1000 + 10 }, lines: { data: [{ type: 'subscription', period: { start: +from / 1000, end: +through / 1000 } }] } });
  const event = (type: string, object: any, created = +end / 1000 + 10) => ({ id: randomUUID(), type, created, data: { object } }) as Stripe.Event;
  async function process(event: Stripe.Event) {
    await retrySerializableTransaction(() => db.$transaction(tx => processStripeEvent(tx, event), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    const { reconcileVipRenewalStripeEvent } = await import('@/lib/domain/bookings/vip-renewal-continuity');
    return reconcileVipRenewalStripeEvent(db, event);
  }
  async function reconcile() { return (await import('@/lib/domain/bookings/vip-renewal-continuity')).reconcileVipRenewalBookings(db, { userId: id }); }
  return { id, account, product, template, saturday, occurrence, book, invoice, event, process, reconcile };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
// Pause an actual Prisma interactive transaction at an observed SQL boundary.
function gateAction(at: 'before-transaction' | 'after-entitlement') {
  const reached = deferred(), release = deferred(); let used = false;
  mocks.db = new Proxy(db, { get(target, key) {
    if (key !== '$transaction') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
    return (callback: any, options: any) => db.$transaction(async tx => {
      if (at === 'before-transaction' && !used) { used = true; reached.resolve(); await release.promise; }
      const wrapped = new Proxy(tx, { get(target, key) {
        if (key !== '$executeRaw') return Reflect.get(target, key);
        return async (...args: any[]) => {
          const result = await (tx.$executeRaw as any)(...args);
          if (at === 'after-entitlement' && !used && args[0].join('').includes('UPDATE "User"')) { used = true; reached.resolve(); await release.promise; }
          return result;
        };
      } });
      return callback(wrapped);
    }, { ...options, timeout: 15000 });
  } });
  return { reached, release };
}
afterEach(() => { mocks.db = db; });
describe('controlled database lifecycle interleavings', () => {
  it('admits next-week classes within seven days after renewal and rejects the exact upper boundary', async () => {
    const f = await fixture();
    const allowed = await f.occurrence('2026-11-13T22:09:24.999Z');
    const booking = await f.book(allowed);
    expect((booking.policySnapshot as any).vipRenewalReservation.membershipId).toBe(f.id);
    const beyond = await f.occurrence('2026-11-13T22:09:25Z');
    await db.booking.update({where:{id:booking.id},data:{status:'CANCELLED'}});
    await expect(bookOccurrenceAction(form({occurrenceId:beyond.id}))).rejects.toThrow('result=access');
    expect(await db.booking.count({where:{occurrenceId:beyond.id}})).toBe(0);
  });
  it.each(['booking-first', 'request-first'])('actual downgrade request versus booking: %s', async order => {
    const f = await fixture();
    const lower = await db.product.create({ data: { slug: f.id + '-lower', name: 'Synthetic lower plan', description: 'Synthetic', kind: 'LIMITED_MEMBERSHIP', priceCents: 9900, billingInterval: 'MONTHLY', includedCredits: 4, eligibleCategoryIds: [] } });
    const gate = gateAction('after-entitlement');
    const book = () => bookOccurrenceAction(form({ occurrenceId: f.saturday.id })).catch(e => e.message);
    const request = () => requestMembershipChangeAction(form({ membershipId: f.id, type: 'CHANGE', requestedProductId: lower.id })).catch(e => e.message);
    const first = order === 'booking-first' ? book() : request();
    await gate.reached.promise;
    const second = order === 'booking-first' ? request() : book();
    gate.release.resolve();
    const results = await Promise.all([first, second]);
    expect(results.some(result => result.includes('result=requested'))).toBe(true);
    expect(await db.booking.count({ where: { userId: f.id, status: 'CONFIRMED' } })).toBe(0);
    expect(await db.membershipChangeRequest.count({ where: { membershipId: f.id, status: 'PENDING', requestedProductId: lower.id } })).toBe(1);
    expect(await db.creditLedgerEntry.count({ where: { creditAccount: { userId: f.id } } })).toBe(0);
  });
  it.each(['freeze', 'cancel', 'failed', 'downgrade'] as const)('booking-first versus %s keeps no unfunded seat or invented inventory', async kind => {
    const f = await fixture();
    const gate = gateAction('after-entitlement');
    const booking = bookOccurrenceAction(form({ occurrenceId: f.saturday.id })).catch(e => e.message);
    await gate.reached.promise;
    const lifecycle = db.$transaction(async tx => {
      await lockMembershipEntitlements(tx, f.id);
      if (kind === 'freeze') await tx.membershipFreeze.create({ data: { membershipId: f.id, createdById: f.id, startAt: end, endAt: next } });
      if (kind === 'cancel') await tx.membership.update({ where: { id: f.id }, data: { cancelAtPeriodEnd: true } });
      if (kind === 'failed') await processStripeEvent(tx, f.event('invoice.payment_failed', { ...f.invoice('race-failure'), status: 'open', amount_paid: 0 }));
      if (kind === 'downgrade') await tx.product.update({ where: { id: f.id }, data: { kind: 'MONTHLY_UNLIMITED' } });
    });
    gate.release.resolve();
    expect(await booking).toContain('result=confirmed'); await lifecycle; await f.reconcile();
    expect((await db.booking.findUniqueOrThrow({ where: { occurrenceId_userId: { occurrenceId: f.saturday.id, userId: f.id } } })).status).toBe('CANCELLED');
    expect(await db.creditLedgerEntry.count({ where: { creditAccount: { userId: f.id } } })).toBe(0);
  });
  it.each(['freeze', 'cancel', 'failed'] as const)('%s-first denies a racing renewal-week booking', async kind => {
    const f = await fixture(); const locked = deferred(), release = deferred();
    const lifecycle = db.$transaction(async tx => {
      await lockMembershipEntitlements(tx, f.id); locked.resolve(); await release.promise;
      if (kind === 'freeze') await tx.membershipFreeze.create({ data: { membershipId: f.id, createdById: f.id, startAt: end, endAt: next } });
      if (kind === 'cancel') await tx.membership.update({ where: { id: f.id }, data: { cancelAtPeriodEnd: true } });
      if (kind === 'failed') await processStripeEvent(tx, f.event('invoice.payment_failed', { ...f.invoice('race-failure'), status: 'open', amount_paid: 0 }));
    });
    await locked.promise;
    const booking = bookOccurrenceAction(form({ occurrenceId: f.saturday.id })).catch(e => e.message);
    // Observe PostgreSQL itself waiting, not a timing-based mock of a race.
    let waiting = false;
    for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
      const rows = await db.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted) AS waiting`;
      waiting = rows[0].waiting;
    }
    release.resolve(); await lifecycle;
    expect(waiting).toBe(true);
    expect(await booking).not.toContain('result=confirmed');
    expect(await db.booking.count({ where: { userId: f.id } })).toBe(0);
    expect(await db.creditLedgerEntry.count({ where: { creditAccount: { userId: f.id } } })).toBe(0);
  });
  it('a successful paid-window transfer retains authoritative funding attribution', async () => {
    const f = await fixture(); const b = await f.book();
    await db.classOccurrence.update({ where: { id: f.saturday.id }, data: { instructorId: f.id } });
    const destination = await f.occurrence('2026-11-05T16:00Z');
    const gate = gateAction('before-transaction');
    const moving = transferBookingAction(form({ bookingId: b.id, destinationId: destination.id })).catch(e => e.message);
    await gate.reached.promise;
    await db.booking.update({ where: { id: b.id }, data: { policySnapshot: { ...(b.policySnapshot as any), fundingAudit: 'current-not-preflight' } } });
    gate.release.resolve(); expect(await moving).toContain('transfer=complete');
    const current = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect((current.policySnapshot as any).fundingAudit).toBe('current-not-preflight');
    expect((current.policySnapshot as any).vipRenewalReservation).toEqual((b.policySnapshot as any).vipRenewalReservation);
    expect(await db.creditLedgerEntry.count({ where: { creditAccount: { userId: f.id } } })).toBe(0);
  });
  it('does not complete a transfer after cancellation wins the transaction boundary', async () => {
    const f = await fixture(); const b = await f.book();
    await db.classOccurrence.update({ where: { id: f.saturday.id }, data: { instructorId: f.id } });
    const destination = await f.occurrence('2026-11-05T16:00Z');
    const gate = gateAction('before-transaction');
    const moving = transferBookingAction(form({ bookingId: b.id, destinationId: destination.id, occurrenceId: f.saturday.id })).catch(e => e.message);
    await gate.reached.promise;
    await db.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', policySnapshot: { ...(b.policySnapshot as any), vipRenewalRelease: { reason: 'RENEWAL_UNFUNDED' } } } });
    gate.release.resolve();
    expect(await moving).toContain('error=destination');
    const current = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(current.occurrenceId).toBe(f.saturday.id);
    expect((current.policySnapshot as any).vipRenewalRelease.reason).toBe('RENEWAL_UNFUNDED');
    expect((current.policySnapshot as any).vipRenewalReservation).toEqual((b.policySnapshot as any).vipRenewalReservation);
  });
});
describe('actual booking / renewal outcome / cancellation', () => {
  it('books both Saturday times without finite/event usage or expiry extension', async () => {
    const f = await fixture(); const later = await f.occurrence('2026-11-07T18:12Z');
    const eventAccount = await db.creditAccount.create({ data: { userId: f.id, label: 'Event credit — November VIP complimentary event credit', validFrom: now, validUntil: next } });
    await db.creditLedgerEntry.create({ data: { creditAccountId: eventAccount.id, type: 'GRANT', quantity: 1 } });
    for (const target of [f.saturday,later]) {
      const b = await f.book(target);
      expect((b.policySnapshot as any).vipRenewalReservation).toEqual({ version: 1, membershipId: f.id, creditAccountId: f.account.id, paidThroughAtBooking: end.toISOString() });
    }
    expect(await db.creditLedgerEntry.count({ where: { creditAccountId: f.account.id } })).toBe(0);
    expect(await db.creditLedgerEntry.count({ where: { creditAccountId: eventAccount.id } })).toBe(1);
    expect((await db.creditAccount.findUniqueOrThrow({ where: { id: f.account.id } })).validUntil).toEqual(end);
  });
  it.each(['failed','deleted','cancel-at-end','freeze','no-webhook'])('releases only tagged unfunded seats on %s; replay is harmless', async reason => {
    const f = await fixture(); const b = await f.book();
    const old = await f.occurrence('2026-11-05T16:00Z'); const paid = await f.book(old);
    const other = await f.occurrence('2026-11-07T20:00Z');
    const ticket = await db.booking.create({ data: { userId: f.id, occurrenceId: other.id, policySnapshot: { accessType: 'STANDARD', classTicket: { occurrenceId: other.id } } } });
    if (reason === 'failed') {
      vi.setSystemTime(new Date(+end + 1000)); const failure = f.event('invoice.payment_failed', { ...f.invoice('renewal'), status: 'open', amount_paid: 0 });
      await f.process(failure); await f.process(failure);
    } else if (reason === 'deleted' || reason === 'cancel-at-end') {
      await f.process(f.event(reason === 'deleted' ? 'customer.subscription.deleted' : 'customer.subscription.updated', { id: f.id, status: reason === 'deleted' ? 'canceled' : 'active', cancel_at_period_end: true, current_period_start: +start / 1000, current_period_end: +end / 1000 }, +now / 1000));
    } else if (reason === 'freeze') {
      await db.membershipFreeze.create({ data: { membershipId: f.id, createdById: f.id, startAt: end, endAt: next } }); await f.reconcile();
    } else { vi.setSystemTime(new Date(+end + 1000)); await f.reconcile(); }
    await f.reconcile();
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CANCELLED');
    expect((await db.booking.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe('CONFIRMED');
    expect((await db.booking.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe('CONFIRMED');
    expect(await db.creditLedgerEntry.count({ where: { creditAccountId: f.account.id } })).toBe(0);
    expect(await db.inAppNotification.count({ where: { userId: f.id, dedupeKey: { startsWith: 'vip-renewal-release:' } } })).toBe(1);
    expect(mocks.queue.mock.calls.filter(([,p]) => p.dedupeKey?.startsWith('vip-renewal-release:'))).toHaveLength(1);
    expect(mocks.charge).not.toHaveBeenCalled(); expect(mocks.refund).not.toHaveBeenCalled();
  });
  it.each(['stale-failed','same-invoice-failed','stale-deleted','replayed-paid'])('paid renewal retains the reservation across %s', async order => {
    const f = await fixture(); const b = await f.book(); vi.setSystemTime(new Date(+end + 20000));
    const paid = f.event('invoice.paid', f.invoice('renewal')); await f.process(paid);
    if (order === 'stale-failed') await f.process(f.event('invoice.payment_failed', f.invoice('old',start,end), +start / 1000 + 20));
    if (order === 'same-invoice-failed') await f.process(f.event('invoice.payment_failed', f.invoice('renewal'), +end / 1000 + 5));
    if (order === 'stale-deleted') await f.process(f.event('customer.subscription.deleted', { id: f.id, status: 'canceled', current_period_start: +start / 1000, current_period_end: +end / 1000 }, +start / 1000 + 20));
    if (order === 'replayed-paid') await f.process(paid);
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CONFIRMED');
    expect(await db.creditLedgerEntry.count({ where: { creditAccountId: f.account.id } })).toBe(0);
  });
  it('failure followed by payment does not resurrect a released seat', async () => {
    const f = await fixture(); const b = await f.book(); vi.setSystemTime(new Date(+end + 20000));
    await f.process(f.event('invoice.payment_failed', { ...f.invoice('renewal'), status: 'open', amount_paid: 0 }, +end / 1000 + 5));
    await f.process(f.event('invoice.paid', f.invoice('renewal')));
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CANCELLED');
  });
  it('member cancellation and replay never create a credit or refund for an unlimited advance reservation', async () => {
    const f = await fixture(); const b = await f.book();
    await expect(cancelBookingAction(form({ bookingId: b.id }))).rejects.toThrow('/member/bookings');
    await expect(cancelBookingAction(form({ bookingId: b.id }))).rejects.toThrow('/member/bookings');
    expect(await db.creditLedgerEntry.count({ where: { creditAccount: { userId: f.id } } })).toBe(0);
    expect(mocks.charge).not.toHaveBeenCalled(); expect(mocks.refund).not.toHaveBeenCalled();
  });
  it('admin restore cancels an advance seat without manufacturing rollover credit', async () => {
    const f = await fixture(); const b = await f.book();
    await expect(restoreCreditAction(form({ bookingId: b.id, occurrenceId: f.saturday.id }))).rejects.toThrow('/admin/');
    await expect(restoreCreditAction(form({ bookingId: b.id, occurrenceId: f.saturday.id }))).rejects.toThrow('/admin/');
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CANCELLED');
    expect(await db.creditLedgerEntry.count({ where: { creditAccount: { userId: f.id } } })).toBe(0);
    expect(await db.creditAccount.count({ where: { userId: f.id } })).toBe(1);
  });
  it('rejects attendance when renewal proof never arrived, even with no lifecycle webhook/job', async () => {
    const f = await fixture(); const b = await f.book(); vi.setSystemTime(f.saturday.startAt);
    await expect(markAttendanceAction(form({ occurrenceId: f.saturday.id, bookingId: b.id, status: 'CHECKED_IN' }))).rejects.toThrow('renewal-unfunded');
    expect(await db.attendanceRecord.count({ where: { bookingId: b.id } })).toBe(0);
  });
  it('permits attendance only after the actual invoice-paid processor extends paid coverage', async () => {
    const f = await fixture(); const b = await f.book(); vi.setSystemTime(new Date(+end + 20000));
    await f.process(f.event('invoice.paid', f.invoice('renewal'))); vi.setSystemTime(f.saturday.startAt);
    await expect(markAttendanceAction(form({ occurrenceId: f.saturday.id, bookingId: b.id, status: 'CHECKED_IN' }))).rejects.toThrow('attendance-checked_in');
    expect(await db.attendanceRecord.count({ where: { bookingId: b.id, status: 'CHECKED_IN' } })).toBe(1);
  });
});
