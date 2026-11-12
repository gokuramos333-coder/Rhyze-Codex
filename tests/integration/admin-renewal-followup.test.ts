import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminRenewalTestDatabase, assertAdminRenewalTestDatabaseIdentity } from '@/scripts/release/admin-test-database';
const mocks = vi.hoisted(() => ({ db: null as any, actor: null as any, queue: vi.fn(), charge: vi.fn(), refund: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: async () => mocks.actor, requireArea: async () => mocks.actor, requireActiveUser: async () => ({ ...mocks.actor, role: 'OWNER' }) }));
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
const database = adminRenewalTestDatabase(process.env);
const url = database.url;
const db = new PrismaClient({ datasourceUrl: url }); mocks.db = db;
import { addMemberToClassAction } from '@/app/(studio)/admin/schedule/[occurrenceId]/roster/actions';
const start = new Date('2026-10-06T22:09:25Z'), end = new Date('2026-11-06T22:09:25Z'), next = new Date('2026-12-06T22:09:25Z');
const now = new Date('2026-11-03T20:00Z');
const form = (values: Record<string,string>) => { const f = new FormData(); for (const [k,v] of Object.entries(values)) f.set(k,v); return f; };
afterEach(() => vi.useRealTimers()); afterAll(() => db.$disconnect());
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
    await expect(addMemberToClassAction(form({ occurrenceId: target.id, memberQuery: user.email }))).rejects.toThrow('result=member-added');
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

afterEach(() => { mocks.db = db; });
describe('owner renewal admission', () => {
  beforeAll(async () => {
    const identity = await db.$queryRaw<any[]>`SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port, current_setting('data_directory') AS directory`;
    assertAdminRenewalTestDatabaseIdentity(database, identity);
    const guards = await db.$queryRaw<any[]>`SELECT tgname FROM pg_trigger WHERE tgrelid = '"Booking"'::regclass AND NOT tgisinternal`;
    expect(guards.length).toBeGreaterThan(0);
  });
  it('books through the real action with a scheduled same-VIP price change', async () => {
    const f = await fixture();
    await db.membershipPlanChange.create({ data: {
      membershipId: f.id, activeMembershipId: f.id, fromProductId: f.product.id, toProductId: f.product.id,
      actorId: f.id, status: 'SCHEDULED', timing: 'NEXT_RENEWAL', effectiveAt: end,
      periodStart: start, periodEnd: end, expiresAt: end, stripeSubscriptionId: f.id,
      stripeCustomerId: 'cus_synthetic', stripeItemId: 'si_synthetic', fromPriceId: 'price_synthetic',
      toPriceId: 'price_synthetic', stripeScheduleId: `sched_${f.id}`,
      quote: { resetBillingCycle: false, monthlyCents: 17760 },
    } });
    const booking = await f.book();
    expect((booking.policySnapshot as any).vipRenewalReservation.membershipId).toBe(f.id);
    expect(await db.creditLedgerEntry.count({ where: { creditAccountId: f.account.id } })).toBe(0);
    expect((await db.creditAccount.findUniqueOrThrow({ where: { id: f.account.id } })).validUntil).toEqual(end);
    expect((await db.membershipPlanChange.findUniqueOrThrow({ where: { activeMembershipId: f.id } })).status).toBe('SCHEDULED');
  });
  it('admits next-week classes within seven days after renewal and rejects the exact upper boundary', async () => {
    const f = await fixture();
    const allowed = await f.occurrence('2026-11-13T22:09:24.999Z');
    const booking = await f.book(allowed);
    expect((booking.policySnapshot as any).vipRenewalReservation.membershipId).toBe(f.id);
    const beyond = await f.occurrence('2026-11-13T22:09:25Z');
    await db.booking.update({where:{id:booking.id},data:{status:'CANCELLED'}});
    await expect(addMemberToClassAction(form({occurrenceId:beyond.id,memberQuery:`${f.id}@example.test`}))).rejects.toThrow('member-no-credit');
    expect(await db.booking.count({where:{occurrenceId:beyond.id}})).toBe(0);
  });
  it.each(['cancel', 'inactive'])('rereads authoritative %s state after search and entitlement lock', async kind => {
    const f = await fixture(); let release!: () => void; let reached!: () => void;
    const waiting = new Promise<void>(r => { reached = r; }); const resume = new Promise<void>(r => { release = r; }); let paused = false;
    mocks.db = new Proxy(db, { get(target, key) {
      if (key !== '$transaction') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
      return (callback: any) => db.$transaction(async tx => callback(new Proxy(tx, { get(target, key) {
        if (key !== '$executeRaw') return Reflect.get(target, key);
        return async (...args: any[]) => {
          if (!paused && args[0].join('').includes('hashtextextended')) { paused = true; reached(); await resume; }
          return (tx.$executeRaw as any)(...args);
        };
      } })), { timeout: 15000 });
    } });
    const booking = addMemberToClassAction(form({ occurrenceId: f.saturday.id, memberQuery: `${f.id}@example.test` })).catch(e => e.message);
    await waiting;
    await db.$transaction(async tx => { await lockMembershipEntitlements(tx, f.id);
      if (kind === 'cancel') await tx.membership.update({ where: { id: f.id }, data: { cancelAtPeriodEnd: true } });
      else await tx.user.update({ where: { id: f.id }, data: { status: 'INVITED' } });
    });
    release(); expect(await booking).toContain(kind === 'cancel' ? 'member-no-credit' : 'member-not-found');
    expect(await db.booking.count({ where: { occurrenceId: f.saturday.id } })).toBe(0);
  });
  it('tags the Saturday within seven days after cutoff and preserves admin audit, expiry and no debit', async () => {
    const f = await fixture(); const b = await f.book();
    expect(b.source).toBe('ADMIN_ADDED');
    expect((b.policySnapshot as any).vipRenewalReservation).toEqual({ version: 1, membershipId: f.id, creditAccountId: f.account.id, paidThroughAtBooking: end.toISOString() });
    expect(await db.auditLog.count({ where: { action: 'booking.admin-add-member', entityId: f.saturday.id } })).toBe(1);
    await expect(addMemberToClassAction(form({ occurrenceId: f.saturday.id, memberQuery: `${f.id}@example.test` }))).rejects.toThrow('member-already-booked');
    expect(await db.creditLedgerEntry.count({ where: { creditAccountId: f.account.id } })).toBe(0);
    expect((await db.creditAccount.findUniqueOrThrow({ where: { id: f.account.id } })).validUntil).toEqual(end);
  });
  it.each(['outside-seven-days','event','finite','cancel','freeze','missing-provider','pending-change','waiver','full','overlap','inactive'])( 'denies %s without writes', async kind => {
    const f = await fixture();
    if (kind === 'outside-seven-days') await db.classOccurrence.update({ where: { id: f.saturday.id }, data: { startAt: new Date('2026-11-14T16:00Z'), endAt: new Date('2026-11-14T17:00Z') } });
    if (kind === 'event') await db.classTemplate.update({ where: { id: f.template.id }, data: { isEvent: true } });
    if (kind === 'finite') { await db.creditAccount.update({ where: { id: f.account.id }, data: { isUnlimited: false } }); await db.creditLedgerEntry.create({ data: { creditAccountId: f.account.id, type: 'GRANT', quantity: 1 } }); }
    if (kind === 'cancel') await db.membership.update({ where: { id: f.id }, data: { cancelAtPeriodEnd: true } });
    if (kind === 'freeze') await db.membershipFreeze.create({ data: { membershipId: f.id, createdById: f.id, startAt: end, endAt: next } });
    if (kind === 'missing-provider') await db.membership.update({ where: { id: f.id }, data: { stripeSubscriptionId: null } });
    if (kind === 'pending-change') await db.membershipChangeRequest.create({ data: { membershipId: f.id, userId: f.id, type: 'CANCEL' } });
    if (kind === 'waiver') await db.waiverAcceptance.deleteMany({ where: { userId: f.id } });
    if (kind === 'full') await db.classOccurrence.update({ where: { id: f.saturday.id }, data: { capacity: 0 } });
    if (kind === 'overlap') { const o = await f.occurrence(); await db.booking.create({ data: { occurrenceId: o.id, userId: f.id } }); }
    if (kind === 'inactive') await db.user.update({ where: { id: f.id }, data: { status: 'INVITED' } });
    const expected = ({ waiver: 'member-waiver', full: 'full', overlap: 'member-overlap', inactive: 'member-not-found' } as Record<string, string>)[kind] ?? 'member-no-credit';
    await expect(addMemberToClassAction(form({ occurrenceId: f.saturday.id, memberQuery: `${f.id}@example.test` }))).rejects.toThrow(`result=${expected}`);
    expect(await db.booking.count({ where: { occurrenceId: f.saturday.id } })).toBe(0);
    expect(await db.creditLedgerEntry.count({ where: { creditAccountId: f.account.id, type: 'RESERVE' } })).toBe(0);
  });
  it('requires disambiguation instead of choosing alphabetically', async () => {
    const f = await fixture(); await db.user.update({ where: { id: f.id }, data: { name: f.id } });
    await db.user.create({ data: { email: `${f.id}-duplicate@example.test`, name: f.id, status: 'ACTIVE' } });
    await expect(addMemberToClassAction(form({ occurrenceId: f.saturday.id, memberQuery: f.id }))).rejects.toThrow('member-ambiguous');
    expect(await db.booking.count({ where: { occurrenceId: f.saturday.id } })).toBe(0);
    await f.book(); // Exact email is not obscured by a substring match.
  });
  it.each(['failure','cancel'])('cleanup on %s retains history and admin recovery fails closed', async kind => {
    const f = await fixture(); const b = await f.book();
    if (kind === 'failure') { vi.setSystemTime(new Date(+end + 1000)); await f.process(f.event('invoice.payment_failed', { ...f.invoice('failure'), status: 'open', amount_paid: 0 })); }
    else await expect(cancelBookingAction(form({ bookingId: b.id }))).rejects.toThrow('/member/bookings');
    const cancelled = await db.booking.findUniqueOrThrow({ where: { id: b.id } }); expect(cancelled.status).toBe('CANCELLED');
    expect((cancelled.policySnapshot as any).vipRenewalReservation).toEqual((b.policySnapshot as any).vipRenewalReservation);
    await expect(addMemberToClassAction(form({ occurrenceId: f.saturday.id, memberQuery: `${f.id}@example.test` }))).rejects.toThrow('member-renewal-recovery');
    expect(await db.booking.findUniqueOrThrow({ where: { id: b.id } })).toEqual(cancelled);
    expect(await db.creditLedgerEntry.count({ where: { creditAccountId: f.account.id } })).toBe(0);
  });
  it('keeps ordinary paid-window finite debit exactly once on replay', async () => {
    const f = await fixture(); const o = await f.occurrence('2026-11-05T16:00Z');
    await db.product.update({ where: { id: f.id }, data: { kind: 'LIMITED_MEMBERSHIP', isUnlimited: false, includedCredits: 2 } });
    await db.creditAccount.update({ where: { id: f.account.id }, data: { isUnlimited: false } });
    await db.creditLedgerEntry.create({ data: { creditAccountId: f.account.id, type: 'GRANT', quantity: 2 } });
    const b = await f.book(o); expect((b.policySnapshot as any).vipRenewalReservation).toBeUndefined();
    await expect(addMemberToClassAction(form({ occurrenceId: o.id, memberQuery: `${f.id}@example.test` }))).rejects.toThrow('member-already-booked');
    expect(await db.creditLedgerEntry.count({ where: { bookingId: b.id, type: 'RESERVE' } })).toBe(1);
  });
});
