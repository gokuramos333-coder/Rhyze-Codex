import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ db: null as any, actor: null as any, queue: vi.fn(), charge: vi.fn(), refund: vi.fn(), provider: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: async () => ({ ...mocks.actor, role: 'OWNER' }), requireArea: async () => mocks.actor, requireActiveUser: async () => ({ ...mocks.actor, role: 'OWNER' }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw Object.assign(Error(url), { digest: `NEXT_REDIRECT;replace;${url};307;` }); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: mocks.queue }));
vi.mock('@/lib/payments/attendance-fee', () => ({ chargeAttendanceFee: mocks.charge, refundAttendanceFee: mocks.refund }));
import { bookOccurrenceAction, cancelBookingAction } from '@/app/(portal)/member/bookings/actions';
import { markAttendanceAction, restoreCreditAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/roster/actions';
import { scheduleMembershipFreezeAction, updateMemberMembershipAction } from '@/app/(studio)/admin/members/[userId]/actions';
import { reconcileVipRenewalBookings } from '@/lib/domain/bookings/vip-renewal-continuity';
vi.mock('@/lib/payments/stripe', () => ({ stripeIsConfigured: () => true, getStripe: () => ({ subscriptions: { update: mocks.provider } }) }));
import { transferBookingAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/transfers/actions';
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
async function fixture() {
  vi.resetAllMocks(); mocks.provider.mockResolvedValue({ id: 'synthetic-only' }); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  const id = `remediation-test-${randomUUID()}`;
  const user = await db.user.create({ data: { id, email: `${id}@example.test`, status: 'ACTIVE', stripeCustomerId: `cus_${id}` } }); mocks.actor = user;
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
  return { id, user, account, product, template, saturday, occurrence, book, invoice, event, process, reconcile };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
// Pause an actual Prisma interactive transaction at an observed SQL boundary.
function gateClient(at: 'before-transaction' | 'after-entitlement') {
  const reached = deferred(), release = deferred(); let used = false;
  const client = new Proxy(db, { get(target, key) {
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
  return { reached, release, client };
}
afterEach(() => { mocks.db = db; });

// Identity/guard checks run before any synthetic fixture writes. Never fall back
// to DATABASE_URL or a different cluster. Production/provider/email calls are mocked.
beforeAll(async () => {
  const identity = await db.$queryRaw<{ name: string; address: string; port: number; directory: string }[]>`
    SELECT current_database() AS name, host(inet_server_addr()) AS address,
      inet_server_port() AS port, current_setting('data_directory') AS directory`;
  assertKellyTestDatabaseIdentity(database, identity);
  const guards = await db.$queryRaw<{ tgname: string }[]>`
    SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O'
      AND tgname IN ('reject_archived_booking', 'reject_archived_waitlist')`;
  expect(guards.map(g => g.tgname).sort()).toEqual(['reject_archived_booking', 'reject_archived_waitlist']);
  const indexes = await db.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE tablename = 'User'
      AND indexname = 'User_email_case_insensitive_key'`;
  expect(indexes).toHaveLength(1);
});
// Reviewer F1 reproduction: actual paid conversion, cleanup, paid finite renewal,
// retained-row recovery, then the current studio/instructor cancellation actions.
describe('F1 recovered finite cancellation ledger', () => {
  async function recovered() {
    const f = await fixture(); const b = await f.book(); const change = await downgrade(f);
    await processOnly(change.event); await f.reconcile(); await expectBalancedReturn(f, b.id);
    vi.setSystemTime(new Date(+end + 20000));
    const paid = f.event('invoice.paid', { ...f.invoice('finite-renewal'), customer: `cus_${f.id}`,
      billing_reason: 'subscription_cycle', lines: { data: [{ price: `price_finite_${f.id}`,
        period: { start: +end / 1000, end: +next / 1000 } }] } });
    await processOnly(paid); await f.reconcile(); expect((await f.book()).id).toBe(b.id);
    expect((await ledger(b.id)).reduce((sum, e) => sum + e.quantity, 0)).toBe(-1);
    return { f, b, paid };
  }
  async function cancellation(f: Fixture, kind: 'single' | 'series' | 'instructor') {
    const studio = await import('@/app/(studio)/admin/schedule/[occurrenceId]/actions');
    if (kind === 'series') {
      const series = await db.classSeries.create({ data: { templateId: f.template.id, recurrenceRule: 'FREQ=WEEKLY', startsAt: f.saturday.startAt } });
      await db.classOccurrence.update({ where: { id: f.saturday.id }, data: { seriesId: series.id } });
      return () => studio.cancelSeriesAction(form({ seriesId: series.id }));
    }
    if (kind === 'instructor') {
      await db.classOccurrence.update({ where: { id: f.saturday.id }, data: { instructorId: f.id } });
      const { cancelAssignedClassAction } = await import('@/app/(portal)/instructor/classes/[occurrenceId]/message/actions');
      return () => cancelAssignedClassAction(form({ occurrenceId: f.saturday.id, cancellationReason: 'Synthetic studio cancellation' }));
    }
    return () => studio.cancelOccurrenceAction(form({ id: f.saturday.id }));
  }
  it.each(['single', 'series', 'instructor'] as const)('returns only outstanding spend with unchanged history/account/expiry: %s', async kind => {
    const { f, b, paid } = await recovered();
    const other = await f.book(await f.occurrence('2026-11-08T16:00Z'));
    const untouched = await ledger(other.id), otherBooking = await bookingState(other.id);
    const history = await ledger(b.id), accounts = await db.creditAccount.findMany({ where: { userId: f.id } });
    const cancel = await cancellation(f, kind); mocks.queue.mockClear();
    await expect(cancel()).rejects.toThrow(/schedule/);
    await f.reconcile();
    const after = await ledger(b.id);
    expect(after.reduce((sum, e) => sum + e.quantity, 0)).toBe(0);
    expect(after).toEqual(expect.arrayContaining(history));
    expect(after.filter(e => e.type === 'RELEASE')).toHaveLength(2);
    expect(after.every(e => e.creditAccountId === f.account.id)).toBe(true);
    expect(await db.creditAccount.findMany({ where: { userId: f.id } })).toEqual(accounts);
    expect(await ledger(other.id)).toEqual(untouched); expect(await bookingState(other.id)).toEqual(otherBooking);
    expect(mocks.queue.mock.calls.filter(([, email]) => email.template === 'CLASS_CANCELLED').map(([,email]) => email.payload.creditResult)).toEqual(['Your eligible class credit was returned automatically.']);
    await expect(cancel()).rejects.toThrow(/schedule/); await processOnly(paid); await f.reconcile();
    expect(await ledger(b.id)).toEqual(after);
    expect((await bookingState(b.id)).status).toBe('CANCELLED');
  });
  it.each(['single', 'series', 'instructor'] as const)('does not claim or repeat an old return after unlimited recovery: %s', async kind => {
    const { f, b } = await recovered();
    // Cleanup an unfunded term, then restore settled unlimited entitlement.
    await db.membership.update({ where: { id: f.id }, data: { status: 'CANCELLED' } }); await f.reconcile();
    await db.membership.update({ where: { id: f.id }, data: { status: 'ACTIVE', productId: f.product.id } });
    await db.creditAccount.update({ where: { id: f.account.id }, data: { isUnlimited: true } });
    await f.book(); const history = await ledger(b.id);
    const cancel = await cancellation(f, kind); mocks.queue.mockClear();
    await expect(cancel()).rejects.toThrow(/schedule/);
    expect(await ledger(b.id)).toEqual(history);
    expect(mocks.queue.mock.calls.filter(([,email]) => email.template === 'CLASS_CANCELLED').map(([,email]) => email.payload.creditResult)).toEqual(['No outstanding class credit needed to be returned.']);
  });
  it.each(['single', 'series'] as const)('balances multiple actual cleanup/recovery cycles before concurrent cancellation/replay: %s', async kind => {
    const { f, b } = await recovered();
    for (let cycle = 0; cycle < 2; cycle++) {
      vi.setSystemTime(new Date(+end + 30000 + cycle * 1000));
      const history = await ledger(b.id);
      await db.membership.update({ where: { id: f.id }, data: { status: 'CANCELLED' } }); await f.reconcile();
      expect((await ledger(b.id)).reduce((sum,e) => sum + e.quantity, 0)).toBe(0);
      await db.membership.update({ where: { id: f.id }, data: { status: 'ACTIVE' } }); await f.book();
      expect(await ledger(b.id)).toEqual(expect.arrayContaining(history));
      expect((await ledger(b.id)).reduce((sum,e) => sum + e.quantity, 0)).toBe(-1);
    }
    const cancel = await cancellation(f, kind); mocks.queue.mockClear();
    const gate = gateClient('after-entitlement'); mocks.db = gate.client;
    const first = cancel().catch(e => e.message); await gate.reached.promise;
    const second = cancel().catch(e => e.message);
    let waiting: boolean;
    try { waiting = await waitForBlockedTransaction(); } finally { gate.release.resolve(); }
    expect(await Promise.all([first, second])).toEqual([expect.stringContaining('/admin/schedule'), expect.stringContaining('/admin/schedule')]);
    expect(waiting!).toBe(true);
    const after = await ledger(b.id);
    expect(after.reduce((sum,e) => sum + e.quantity, 0)).toBe(0);
    expect(after.filter(e => e.type === 'RELEASE')).toHaveLength(4);
    expect(mocks.queue.mock.calls.filter(([,e]) => e.template === 'CLASS_CANCELLED')).toHaveLength(1);
    await expect(cancel()).rejects.toThrow('/admin/schedule'); expect(await ledger(b.id)).toEqual(after);
  });
  it('rolls back booking cancellation and fresh release together when the outbox fails', async () => {
    const { f, b } = await recovered(); const before = await ledger(b.id), booking = await bookingState(b.id);
    const cancel = await cancellation(f, 'single'); mocks.queue.mockRejectedValueOnce(Error('F1 outbox failure'));
    await expect(cancel()).rejects.toThrow('F1 outbox failure');
    expect(await ledger(b.id)).toEqual(before); expect(await bookingState(b.id)).toEqual(booking);
    expect((await db.classOccurrence.findUniqueOrThrow({ where: { id: f.saturday.id } })).status).toBe('SCHEDULED');
    await expect(cancel()).rejects.toThrow('/admin/schedule');
    expect((await ledger(b.id)).reduce((sum,e) => sum + e.quantity, 0)).toBe(0);
  });
});
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function processOnly(event: Stripe.Event, client = db) {
  return retrySerializableTransaction(() => client.$transaction(tx => processStripeEvent(tx, event), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000,
  }));
}
async function downgrade(f: Fixture) {
  const lower = await db.product.create({ data: {
    slug: f.id + '-finite', name: 'Synthetic paid finite', description: 'Synthetic only',
    kind: 'LIMITED_MEMBERSHIP', priceCents: 9900, includedCredits: 4,
    billingInterval: 'MONTHLY', isUnlimited: false, eligibleCategoryIds: [],
  } });
  await db.membership.update({ where: { id: f.id }, data: { planChangeState: {
    paidStart: +start / 1000, paidEnd: +end / 1000, paidAt: +start / 1000,
  } } });
  const invoiceId = `${f.id}-adjustment`;
  await db.membershipPlanChange.create({ data: {
    membershipId: f.id, activeMembershipId: f.id, fromProductId: f.id, toProductId: lower.id,
    actorId: f.id, status: 'AWAITING_PAYMENT', timing: 'IMMEDIATE', effectiveAt: now,
    periodStart: start, periodEnd: end, expiresAt: end, stripeSubscriptionId: f.id,
    stripeCustomerId: `cus_${f.id}`, stripeItemId: `si_${f.id}`,
    fromPriceId: `price_vip_${f.id}`, toPriceId: `price_finite_${f.id}`,
    stripeInvoiceId: invoiceId, submittedAt: now, quote: {},
  } });
  const event = f.event('invoice.paid', {
    ...f.invoice('adjustment'), customer: `cus_${f.id}`, billing_reason: 'subscription_update',
    payment_intent: `pi_adjustment_${f.id}`, status_transitions: { paid_at: +now / 1000 },
    lines: { data: [{ price: `price_finite_${f.id}`, proration: true,
      period: { start: +now / 1000, end: +end / 1000 } }] },
  }, +now / 1000);
  return { lower, event };
}
const bookingState = (id: string) => db.booking.findUniqueOrThrow({ where: { id } });
const ledger = (id: string) => db.creditLedgerEntry.findMany({ where: { bookingId: id }, orderBy: { createdAt: 'asc' } });
async function restore(f: Fixture, bookingId: string) {
  await expect(restoreCreditAction(form({ bookingId, occurrenceId: (await bookingState(bookingId)).occurrenceId }))).rejects.toThrow('/admin/');
}
async function expectBalancedReturn(f: Fixture, bookingId: string) {
  const entries = await ledger(bookingId);
  expect(entries.filter(e => e.type === 'RESERVE').map(e => e.quantity)).toEqual([-1]);
  expect(entries.filter(e => e.type === 'RELEASE').map(e => e.quantity)).toEqual([1]);
  expect(entries.every(e => e.creditAccountId === f.account.id)).toBe(true);
  expect(entries.reduce((sum, e) => sum + e.quantity, 0)).toBe(0);
  expect(await db.creditAccount.count({ where: { userId: f.id } })).toBe(1);
  expect((await db.creditAccount.findUniqueOrThrow({ where: { id: f.account.id } })).validUntil).toEqual(end);
}
async function waitForBlockedTransaction() {
  for (let n = 0; n < 200; n++) {
    const rows = await db.$queryRaw<{ waiting: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.locktype = 'advisory' AND NOT l.granted AND a.datname = current_database()) AS waiting`;
    if (rows[0].waiting) return true;
  }
  return false;
}
async function recover(f: Fixture) {
  vi.setSystemTime(new Date(+end + 20000));
  const failure = f.event('invoice.payment_failed', { ...f.invoice('renewal'), status: 'open', amount_paid: 0 }, +end / 1000 + 5);
  await f.process(failure);
  const paid = f.event('invoice.paid', f.invoice('renewal'));
  await f.process(paid);
  return { failure, paid };
}

describe('R1 actual paid downgrade ledger ownership', () => {
  it('releases the processor-created debit during cleanup; restore and webhook replay cannot return it twice', async () => {
    const f = await fixture(); const b = await f.book(); const change = await downgrade(f);
    await processOnly(change.event);
    expect((await ledger(b.id)).map(e => [e.type, e.quantity, e.creditAccountId])).toEqual([['RESERVE', -1, f.account.id]]);
    expect((await bookingState(b.id)).policySnapshot).toEqual(b.policySnapshot);
    expect((await db.membership.findUniqueOrThrow({ where: { id: f.id } })).productId).toBe(change.lower.id);
    await f.reconcile();
    expect((await bookingState(b.id)).status).toBe('CANCELLED');
    await expectBalancedReturn(f, b.id);
    await restore(f, b.id); await restore(f, b.id);
    await processOnly(change.event); await f.reconcile();
    await expectBalancedReturn(f, b.id);
  });

  it('admin restore releases actual spend before cleanup and preserves account expiry on replay', async () => {
    const f = await fixture(); const b = await f.book(); const change = await downgrade(f);
    await processOnly(change.event);
    await Promise.all([restore(f, b.id), restore(f, b.id)]);
    await f.reconcile();
    expect((await bookingState(b.id)).status).toBe('CANCELLED');
    await expectBalancedReturn(f, b.id);
  });

  it('does not add a second return after the actual member cancellation already released the conversion debit', async () => {
    const f = await fixture(); const b = await f.book(); const change = await downgrade(f);
    await processOnly(change.event);
    await expect(cancelBookingAction(form({ bookingId: b.id }))).rejects.toThrow('/member/bookings');
    const before = await ledger(b.id);
    expect(before.reduce((sum, e) => sum + e.quantity, 0)).toBe(0);
    await restore(f, b.id); await f.reconcile();
    expect(await ledger(b.id)).toEqual(before);
    expect(await db.creditAccount.count({ where: { userId: f.id } })).toBe(1);
  });

  it('retains a genuinely funded converted booking, including attendance, despite its historical tag', async () => {
    const f = await fixture(); const b = await f.book();
    await db.classOccurrence.update({ where: { id: f.saturday.id }, data: { instructorId: f.id } });
    const destination = await f.occurrence('2026-11-05T16:00Z');
    await expect(transferBookingAction(form({ bookingId: b.id, destinationId: destination.id }))).rejects.toThrow('transfer=complete');
    const change = await downgrade(f); await processOnly(change.event);
    expect((await ledger(b.id)).map(e => e.quantity)).toEqual([-1]);
    await f.reconcile();
    expect((await bookingState(b.id)).status).toBe('CONFIRMED');
    vi.setSystemTime(destination.startAt);
    await expect(markAttendanceAction(form({ occurrenceId: destination.id, bookingId: b.id, status: 'CHECKED_IN' }))).rejects.toThrow('attendance-checked_in');
    expect(await db.attendanceRecord.count({ where: { bookingId: b.id, status: 'CHECKED_IN' } })).toBe(1);
    await restore(f, b.id); await restore(f, b.id);
    await expectBalancedReturn(f, b.id);
  });

  it.each(['conversion-first', 'cleanup-first'] as const)('serializes actual downgrade conversion against cleanup: %s', async order => {
    const f = await fixture(); const b = await f.book(); const change = await downgrade(f);
    const gate = gateClient('after-entitlement');
    const first = order === 'conversion-first'
      ? processOnly(change.event, gate.client)
      : reconcileVipRenewalBookings(gate.client, { userId: f.id });
    await gate.reached.promise;
    const second = order === 'conversion-first' ? f.reconcile() : processOnly(change.event);
    let waiting: boolean;
    try { waiting = await waitForBlockedTransaction(); } finally { gate.release.resolve(); }
    await Promise.all([first, second]);
    expect(waiting!).toBe(true);
    await f.reconcile(); await restore(f, b.id); await processOnly(change.event);
    expect((await bookingState(b.id)).status).toBe('CANCELLED');
    if (order === 'conversion-first') await expectBalancedReturn(f, b.id);
    else expect(await ledger(b.id)).toEqual([]);
  });

  it('rolls back cleanup and credit release together on notification failure, then retries exactly once', async () => {
    const f = await fixture(); const b = await f.book(); const change = await downgrade(f);
    await processOnly(change.event);
    mocks.queue.mockRejectedValueOnce(Error('synthetic outbox failure'));
    await expect(f.reconcile()).rejects.toThrow('synthetic outbox failure');
    expect((await bookingState(b.id)).status).toBe('CONFIRMED');
    expect((await ledger(b.id)).map(e => e.quantity)).toEqual([-1]);
    await f.reconcile(); await f.reconcile(); await restore(f, b.id);
    await expectBalancedReturn(f, b.id);
    expect(await db.inAppNotification.count({ where: { userId: f.id, dedupeKey: { startsWith: 'vip-renewal-release:' } } })).toBe(1);
  });
});

describe('R2 actual admin billing wrapper with provider mocks', () => {
  const schedule = (f: Fixture, startDate = '2026-12-15', resumeDate = '2026-12-22') =>
    scheduleMembershipFreezeAction(form({ userId: f.id, membershipId: f.id, startDate, resumeDate }));
  const cancel = (f: Fixture) => updateMemberMembershipAction(form({ userId: f.id, membershipId: f.id, membershipAction: 'CANCEL_AT_PERIOD_END' }));

  it('schedules a nonoverlapping future freeze without destroying the valid contingent seat', async () => {
    const f = await fixture(); const b = await f.book();
    await expect(schedule(f)).rejects.toThrow('sent=freeze');
    expect(await db.membershipFreeze.count({ where: { membershipId: f.id, cancelledAt: null } })).toBe(1);
    expect(mocks.provider).not.toHaveBeenCalled();
    expect((await db.membership.findUniqueOrThrow({ where: { id: f.id } })).billingLockToken).toBeNull();
    await f.reconcile();
    expect((await bookingState(b.id)).status).toBe('CONFIRMED');
    expect(await db.inAppNotification.count({ where: { userId: f.id, dedupeKey: { startsWith: 'vip-renewal-release:' } } })).toBe(0);
  });

  it('rejects an overlapping duplicate freeze without releasing a seat outside both freezes', async () => {
    const f = await fixture(); const b = await f.book();
    await expect(schedule(f)).rejects.toThrow('sent=freeze');
    await expect(schedule(f)).rejects.toThrow('error=freeze-policy');
    expect(await db.membershipFreeze.count({ where: { membershipId: f.id } })).toBe(1);
    expect((await bookingState(b.id)).status).toBe('CONFIRMED');
  });

  it.each(['freeze', 'cancel'] as const)('releases only after committed restrictive %s and is harmless on repeated cleanup', async kind => {
    const f = await fixture(); const b = await f.book();
    await expect(kind === 'freeze' ? schedule(f, '2026-11-03', '2026-11-10') : cancel(f)).rejects.toThrow(kind === 'freeze' ? 'sent=freeze' : 'sent=membership-action');
    expect(mocks.provider).toHaveBeenCalledTimes(1);
    const m = await db.membership.findUniqueOrThrow({ where: { id: f.id } });
    expect(m.billingLockToken).toBeNull();
    expect(kind === 'freeze' ? m.status : m.cancelAtPeriodEnd).toBe(kind === 'freeze' ? 'PAUSED' : true);
    await f.reconcile(); await f.reconcile();
    expect((await bookingState(b.id)).status).toBe('CANCELLED');
    expect(await ledger(b.id)).toEqual([]);
    expect(await db.inAppNotification.count({ where: { userId: f.id, dedupeKey: { startsWith: 'vip-renewal-release:' } } })).toBe(1);
  });

  it.each(['freeze', 'cancel'] as const)('definitive provider failure during %s preserves current state and seat', async kind => {
    const f = await fixture(); const b = await f.book();
    mocks.provider.mockRejectedValueOnce(Object.assign(Error('synthetic rejected write'), { type: 'StripeInvalidRequestError' }));
    await expect(kind === 'freeze' ? schedule(f, '2026-11-03', '2026-11-10') : cancel(f)).rejects.toThrow(kind === 'freeze' ? 'error=freeze' : 'error=membership-action');
    const m = await db.membership.findUniqueOrThrow({ where: { id: f.id } });
    expect(m).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: false, billingLockToken: null, billingLockNeedsReview: false });
    expect(await db.membershipFreeze.count({ where: { membershipId: f.id } })).toBe(0);
    await f.reconcile();
    expect((await bookingState(b.id)).status).toBe('CONFIRMED');
  });

  it.each(['freeze', 'cancel'] as const)('uncertain provider result during %s blocks admission but does not infer terminal cancellation', async kind => {
    const f = await fixture(); const b = await f.book();
    mocks.provider.mockRejectedValueOnce(Error('synthetic provider timeout'));
    await expect(kind === 'freeze' ? schedule(f, '2026-11-03', '2026-11-10') : cancel(f)).rejects.toThrow('error=billing-review');
    const m = await db.membership.findUniqueOrThrow({ where: { id: f.id } });
    expect(m.billingLockToken).not.toBeNull(); expect(m.billingLockNeedsReview).toBe(true);
    await f.reconcile();
    expect((await bookingState(b.id)).status).toBe('CONFIRMED');
    const other = await f.occurrence('2026-11-07T18:00Z');
    await expect(bookOccurrenceAction(form({ occurrenceId: other.id }))).rejects.toThrow('result=access');
    expect(await db.booking.count({ where: { occurrenceId: other.id } })).toBe(0);
  });

  it('keeps a seat while the actual cancellation provider call is in flight, then reconciles committed cancellation', async () => {
    const f = await fixture(); const b = await f.book();
    const reached = deferred(), release = deferred();
    mocks.provider.mockImplementationOnce(async () => { reached.resolve(); await release.promise; return {}; });
    const pending = cancel(f).catch(error => error.message);
    await reached.promise;
    let stateDuring: string; let admission: string;
    try {
      await f.reconcile(); stateDuring = (await bookingState(b.id)).status;
      const other = await f.occurrence('2026-11-07T18:00Z');
      admission = await bookOccurrenceAction(form({ occurrenceId: other.id })).catch(error => error.message);
    } finally { release.resolve(); }
    expect(await pending).toContain('sent=membership-action');
    expect(stateDuring!).toBe('CONFIRMED'); expect(admission!).toContain('result=access');
    expect((await bookingState(b.id)).status).toBe('CANCELLED');
  });

  it.each(['freeze', 'cancel'] as const)('provider success plus local rollback during %s retains review ownership and existing seat', async kind => {
    const f = await fixture(); const b = await f.book();
    mocks.queue.mockRejectedValueOnce(Error('synthetic transaction failure after provider success'));
    await expect(kind === 'freeze' ? schedule(f, '2026-11-03', '2026-11-10') : cancel(f)).rejects.toThrow('/admin/');
    expect(mocks.provider).toHaveBeenCalledTimes(1);
    const m = await db.membership.findUniqueOrThrow({ where: { id: f.id } });
    expect(m).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: false, billingLockNeedsReview: true });
    expect(m.billingLockToken).not.toBeNull();
    expect(await db.membershipFreeze.count({ where: { membershipId: f.id } })).toBe(0);
    await f.reconcile(); expect((await bookingState(b.id)).status).toBe('CONFIRMED');
  });
});

describe('R3 actual user-initiated recovery of cleanup-cancelled seats', () => {
  it('denies before payment, stays cancelled after recovery, then reactivates the same row on explicit member action', async () => {
    const f = await fixture(); const b = await f.book();
    vi.setSystemTime(new Date(+end + 20000)); await f.reconcile();
    const released = await bookingState(b.id);
    expect(released.status).toBe('CANCELLED');
    await expect(bookOccurrenceAction(form({ occurrenceId: f.saturday.id }))).rejects.toThrow('result=access');
    const { failure, paid } = await recover(f);
    expect((await bookingState(b.id)).status).toBe('CANCELLED');
    expect((await f.book()).id).toBe(b.id);
    // Financial attribution and the cleanup cancellation remain inspectable.
    expect(JSON.stringify((await bookingState(b.id)).policySnapshot)).toContain('RENEWAL_UNFUNDED');
    expect(JSON.stringify((await bookingState(b.id)).policySnapshot)).toContain(f.account.id);
    expect((await bookingState(b.id)).createdAt).toEqual(b.createdAt);
    await f.process(failure); await f.process(paid); await f.reconcile();
    await expect(bookOccurrenceAction(form({ occurrenceId: f.saturday.id }))).rejects.toThrow('result=duplicate');
    expect((await bookingState(b.id)).status).toBe('CONFIRMED');
    expect(await db.booking.count({ where: { occurrenceId: f.saturday.id, userId: f.id } })).toBe(1);
    expect(await ledger(b.id)).toEqual([]);
  });

  it('uses a fresh finite reservation after paid finite renewal while preserving the old return ledger', async () => {
    const f = await fixture(); const b = await f.book(); const change = await downgrade(f);
    await processOnly(change.event); await f.reconcile();
    await expectBalancedReturn(f, b.id);
    const history = await ledger(b.id);
    vi.setSystemTime(new Date(+end + 20000));
    const paid = f.event('invoice.paid', { ...f.invoice('finite-renewal'), customer: `cus_${f.id}`,
      billing_reason: 'subscription_cycle', lines: { data: [{ price: `price_finite_${f.id}`,
        period: { start: +end / 1000, end: +next / 1000 } }] } });
    await processOnly(paid); await f.reconcile();
    expect((await bookingState(b.id)).status).toBe('CANCELLED');
    expect((await f.book()).id).toBe(b.id);
    const after = await ledger(b.id);
    expect(after).toEqual(expect.arrayContaining(history));
    expect(after.filter(e => e.type === 'RESERVE')).toHaveLength(2);
    expect(after.reduce((sum, e) => sum + e.quantity, 0)).toBe(-1);
    await processOnly(paid); await f.reconcile();
    await expect(bookOccurrenceAction(form({ occurrenceId: f.saturday.id }))).rejects.toThrow('result=duplicate');
    expect(await ledger(b.id)).toEqual(after);
  });

  it('does not return historical finite spend again after unlimited paid recovery and member cancellation', async () => {
    const f = await fixture(); const b = await f.book(); const change = await downgrade(f);
    await processOnly(change.event); await f.reconcile();
    await expectBalancedReturn(f, b.id);
    const history = await ledger(b.id);
    // A subsequent settled unlimited term on the same purchase account.
    await db.membership.update({ where: { id: f.id }, data: { productId: f.product.id, currentPeriodEnd: next } });
    await db.creditAccount.update({ where: { id: f.account.id }, data: { isUnlimited: true, validFrom: end, validUntil: next } });
    vi.setSystemTime(new Date(+end + 20000));
    expect((await f.book()).id).toBe(b.id);
    await expect(cancelBookingAction(form({ bookingId: b.id }))).rejects.toThrow('/member/bookings');
    expect(await ledger(b.id)).toEqual(history);
  });

  it.each(['member', 'admin'] as const)('never reactivates an ordinary %s-cancelled tagged booking', async kind => {
    const f = await fixture(); const b = await f.book();
    if (kind === 'member') await expect(cancelBookingAction(form({ bookingId: b.id }))).rejects.toThrow('/member/bookings');
    else await restore(f, b.id);
    await recover(f);
    await expect(bookOccurrenceAction(form({ occurrenceId: f.saturday.id }))).rejects.toThrow('result=duplicate');
    expect((await bookingState(b.id)).status).toBe('CANCELLED');
  });

  it('requires the current waiver again for recovered access', async () => {
    const f = await fixture(); const b = await f.book(); await recover(f);
    await db.waiverAcceptance.deleteMany({ where: { userId: f.id } });
    await expect(bookOccurrenceAction(form({ occurrenceId: f.saturday.id }))).rejects.toThrow('/member/waiver');
    expect((await bookingState(b.id)).status).toBe('CANCELLED');
    expect(await ledger(b.id)).toEqual([]);
  });

  it.each(['past', 'cancelled'] as const)('denies a recovered booking for a %s occurrence', async kind => {
    const f = await fixture(); const b = await f.book(); await recover(f);
    if (kind === 'past') vi.setSystemTime(f.saturday.endAt);
    else await db.classOccurrence.update({ where: { id: f.saturday.id }, data: { status: 'CANCELLED' } });
    await expect(bookOccurrenceAction(form({ occurrenceId: f.saturday.id }))).rejects.toThrow('result=unavailable');
    expect((await bookingState(b.id)).status).toBe('CANCELLED');
  });

  it('rolls reactivation back on notification failure and permits an explicit retry', async () => {
    const f = await fixture(); const b = await f.book(); await recover(f);
    const released = await bookingState(b.id);
    mocks.queue.mockRejectedValueOnce(Error('synthetic rebook outbox failure'));
    await expect(bookOccurrenceAction(form({ occurrenceId: f.saturday.id }))).rejects.toThrow('synthetic rebook outbox failure');
    expect(await bookingState(b.id)).toEqual(released);
    expect((await f.book()).id).toBe(b.id);
    await expect(bookOccurrenceAction(form({ occurrenceId: f.saturday.id }))).rejects.toThrow('result=duplicate');
  });

  it('serializes two explicit recovery submissions and confirms only once', async () => {
    const f = await fixture(); const b = await f.book(); await recover(f);
    const result = await Promise.all([1, 2].map(() => bookOccurrenceAction(form({ occurrenceId: f.saturday.id })).catch(error => error.message)));
    expect(result.filter(r => r.includes('result=confirmed'))).toHaveLength(1);
    expect(result.filter(r => r.includes('result=duplicate'))).toHaveLength(1);
    expect((await bookingState(b.id)).status).toBe('CONFIRMED');
    expect(await db.booking.count({ where: { occurrenceId: f.saturday.id, userId: f.id } })).toBe(1);
  });

  it.each(['recovery-first', 'new-booking-first'] as const)('respects the last-seat capacity race: %s', async order => {
    const f = await fixture(); const b = await f.book(); await recover(f);
    const competitor = await fixture();
    vi.setSystemTime(new Date(+end + 20000));
    await competitor.process(competitor.event('invoice.paid', competitor.invoice('renewal')));
    await db.classOccurrence.update({ where: { id: f.saturday.id }, data: { capacity: 1 } });
    const gate = gateClient('after-entitlement'); mocks.db = gate.client;
    const submit = (user: typeof f.user) => {
      mocks.actor = user;
      return bookOccurrenceAction(form({ occurrenceId: f.saturday.id })).catch(error => error.message);
    };
    const first = submit(order === 'recovery-first' ? f.user : competitor.user);
    await gate.reached.promise;
    const second = submit(order === 'recovery-first' ? competitor.user : f.user);
    let waiting: boolean;
    try { waiting = await waitForBlockedTransaction(); } finally { gate.release.resolve(); }
    const result = await Promise.all([first, second]);
    expect(waiting!).toBe(true);
    expect(result[0]).toContain('result=confirmed'); expect(result[1]).toContain('result=waitlist');
    expect(await db.booking.count({ where: { occurrenceId: f.saturday.id, status: 'CONFIRMED' } })).toBe(1);
    expect((await bookingState(b.id)).status).toBe(order === 'recovery-first' ? 'CONFIRMED' : 'CANCELLED');
  });
});
