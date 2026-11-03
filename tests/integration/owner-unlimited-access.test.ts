import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const auth = vi.hoisted(() => ({ id: '', role: 'OWNER' }));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: async () => auth }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw Error(url); } }));
vi.mock('@/lib/db/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  const url = process.env.CALLBACK_TEST_DATABASE_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/callback_test') throw Error('Disposable database only');
  return { prisma: new PrismaClient({ datasourceUrl: url }) };
});
import { prisma as db } from '@/lib/db/prisma';
import { grantOwnerUnlimitedAccessAction } from '@/app/(studio)/admin/members/[userId]/actions';
import { addMemberToClassAction } from '@/app/(studio)/admin/schedule/[occurrenceId]/roster/actions';
import { grantOwnerUnlimitedAccess } from '@/lib/domain/credits/grant-owner-unlimited-access';
import { vipCreditAccountCanBook } from '@/lib/domain/credits/vip-access';
import { eventCreditCanBook } from '@/lib/domain/bookings/booking-rules';
import { transferEntitlementAllowed } from '@/lib/domain/transfers/transfer-entitlement';
const url = process.env.CALLBACK_TEST_DATABASE_URL;
if (url && (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/callback_test')) throw Error('Disposable database only');
const id = 'owner-grant-' + randomUUID();
const actor = { id: id + '-owner', role: 'OWNER' };
const userId = id + '-member';
const now = new Date();
const validUntil = new Date(+now + 30 * 86400000);
const input = { actor, userId, now, validUntil, reason: 'Owner-approved temporary unlimited access' };
describe.skipIf(!url)('owner unlimited standard-class access', () => {
  beforeAll(async () => { auth.id = actor.id; await db.user.createMany({ data: [{ ...actor, role: 'OWNER', email: actor.id + '@example.test', status: 'ACTIVE' }, { id: userId, email: userId + '@example.test', status: 'ACTIVE' }] }); });
  afterAll(async () => { await db.$disconnect(); });
  it('grants once under concurrent retries without financial records or emails', async () => {
    const accounts = await Promise.all([1, 2].map(() => db.$transaction(tx => grantOwnerUnlimitedAccess(tx, input))));
    expect(accounts[0].id).toBe(accounts[1].id);
    expect(accounts[0]).toMatchObject({ isUnlimited: true, sourcePurchaseId: null, validUntil });
    expect(await db.auditLog.count({ where: { entityId: userId, action: 'credit.owner-unlimited-grant' } })).toBe(1);
    expect(await db.creditLedgerEntry.findMany({ where: { creditAccountId: accounts[0].id } })).toMatchObject([{ quantity: 0, type: 'GRANT' }]);
    expect(await db.purchase.count({ where: { userId } })).toBe(0);
    expect(await db.membership.count({ where: { userId } })).toBe(0);
    expect(await db.emailMessage.count({ where: { userId } })).toBe(0);
    const account = accounts[0];
    expect(vipCreditAccountCanBook({ account, memberships: [], now, occurrenceStartsAt: new Date(+now + 86400000) })).toBe(true);
    expect(vipCreditAccountCanBook({ account, memberships: [], now, occurrenceStartsAt: validUntil })).toBe(false);
    expect(vipCreditAccountCanBook({ account, memberships: [], now: validUntil })).toBe(false);
    expect(eventCreditCanBook({ ...account, sourceProductKind: null, isEvent: true })).toBe(false);
    const transfer = { accessType: 'COMPLIMENTARY', creditAccountId: account.id, user: { role: 'MEMBER', status: 'ACTIVE', instructorProfile: null, memberships: [], creditAccounts: [account] }, sourceIsEvent: false, destinationIsEvent: false, now, destinationStartsAt: new Date(+now + 2 * 86400000) };
    expect(transferEntitlementAllowed(transfer)).toBe(true);
    expect(transferEntitlementAllowed({ ...transfer, destinationStartsAt: validUntil })).toBe(false);
    expect(transferEntitlementAllowed({ ...transfer, user: { ...transfer.user, creditAccounts: [] } })).toBe(false);
    expect(transferEntitlementAllowed({ ...transfer, sourceIsEvent: true, destinationIsEvent: true })).toBe(false);
  });
  it('lets an owner actually book a standard class, preserves unlimited access, and rejects events/expired dates', async () => {
    const account = await db.$transaction(tx => grantOwnerUnlimitedAccess(tx, input));
    await db.classCategory.create({ data: { id, name: 'Grant test', slug: id } });
    for (const isEvent of [false, true]) await db.classTemplate.create({ data: { id: id + isEvent, slug: id + isEvent, categoryId: id, name: 'Synthetic grant class', description: 'Test only', isEvent, durationMinutes: 50, defaultCapacity: 20, tags: [], equipment: [] } });
    for (const [suffix, startAt, isEvent, result] of [
      ['class', new Date(+now + 86400000), false, 'member-added'],
      ['event', new Date(+now + 2 * 86400000), true, 'member-no-credit'],
      ['expired', validUntil, false, 'member-no-credit'],
    ] as const) {
      const occurrenceId = id + suffix;
      await db.classOccurrence.create({ data: { id: occurrenceId, templateId: id + isEvent, startAt, endAt: new Date(+startAt + 3000000), capacity: 20 } });
      const form = new FormData(); form.set('occurrenceId', occurrenceId); form.set('memberQuery', userId + '@example.test');
      await expect(addMemberToClassAction(form)).rejects.toThrow(`result=${result}`);
    }
    expect(await db.booking.findMany({ where: { userId } })).toMatchObject([{ status: 'CONFIRMED', policySnapshot: { creditAccountId: account.id, accessType: 'COMPLIMENTARY' } }]);
    expect(await db.creditLedgerEntry.count({ where: { creditAccountId: account.id, type: 'RESERVE' } })).toBe(0);
    expect((await db.creditAccount.findUniqueOrThrow({ where: { id: account.id } })).isUnlimited).toBe(true);
  });
  it.each([['2026-10-31', '2026-11-01T04:00:00Z'], ['2026-11-01', '2026-11-02T05:00:00Z'], ['2026-11-03', '2026-11-04T05:00:00Z'], ['2026-03-08', '2026-03-09T04:00:00Z']])('accepts same-day access through Eastern midnight (%s)', async (day, expectedEnd) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(day + 'T16:00:00Z'));
    try {
      const form = new FormData(); form.set('userId', userId); form.set('expirationDate', day); form.set('reason', 'Owner-approved same-day bridge');
      await expect(grantOwnerUnlimitedAccessAction(form)).rejects.toThrow('sent=owner-unlimited');
      expect(await db.creditAccount.findFirst({ where: { userId, validUntil: new Date(expectedEnd) } })).toMatchObject({ isUnlimited: true });
    } finally { vi.useRealTimers(); }
  });
  it.each(['ADMIN', 'MEMBER', 'INSTRUCTOR'])('rejects %s grant authority', async role => {
    await expect(db.$transaction(tx => grantOwnerUnlimitedAccess(tx, { ...input, actor: { ...actor, role } }))).rejects.toThrow('Invalid owner');
  });
  it('rejects expired, unbounded, invalid or unexplained grants', async () => {
    for (const patch of [{ validUntil: now }, { validUntil: new Date('invalid') }, { validUntil: new Date(+now + 400 * 86400000) }, { reason: '' }]) {
      await expect(db.$transaction(tx => grantOwnerUnlimitedAccess(tx, { ...input, ...patch }))).rejects.toThrow('Invalid owner');
    }
  });
});
