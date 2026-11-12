import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const auth = vi.hoisted(() => ({ id: '', role: 'OWNER', email: 'fixture@example.test', name: 'Fixture Member' }));
vi.mock('@/lib/auth/session', () => ({
  requireApprovedOwner: async () => auth,
  requireArea: async () => auth,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Error(url);
  },
}));
vi.mock('@/lib/db/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  const url = process.env.CALLBACK_TEST_DATABASE_URL;
  if (
    !url ||
    !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/callback_test'
  )
    throw Error('Disposable database only');
  return { prisma: new PrismaClient({ datasourceUrl: url }) };
});
import {
  bookOccurrenceAction,
  cancelBookingAction,
} from '@/app/(portal)/member/bookings/actions';
import { prisma as db } from '@/lib/db/prisma';
import { grantGiftCredit } from '@/lib/domain/credits/grant-gift-credit';
import { grantMemberGiftAction } from '@/app/(studio)/admin/members/[userId]/gift-actions';
import { addMemberToClassAction } from '@/app/(studio)/admin/schedule/[occurrenceId]/roster/actions';
const url = process.env.CALLBACK_TEST_DATABASE_URL;
const prefix = 'gift-' + randomUUID();
const owner = prefix + '-owner';
const now = new Date();
const expirationDate = new Date(+now + 30 * 86400000)
  .toISOString()
  .slice(0, 10);
const users = ['CLASS', 'EVENT', 'BOTH'].map((k) => prefix + '-' + k);
describe.skipIf(!url)(
  'member gifts use real isolated ledger transactions',
  () => {
    beforeAll(async () => {
      auth.id = owner;
      await db.user.createMany({
        data: [
          {
            id: owner,
            role: 'OWNER',
            email: owner + '@example.test',
            status: 'ACTIVE',
          },
          ...users.map((id) => ({
            id,
            role: 'MEMBER' as const,
            email: id + '@example.test',
            status: 'ACTIVE' as const,
          })),
        ],
      });
      const waiver =
        (await db.waiverVersion.findFirst({
          where: { isActive: true, requiresSign: true },
        })) ??
        (await db.waiverVersion.create({
          data: {
            version: 900009,
            title: 'Synthetic gift waiver',
            body: 'Test only',
            effectiveAt: now,
            isActive: true,
            requiresSign: true,
          },
        }));
      for (const userId of users)
        await db.waiverAcceptance.create({
          data: {
            userId,
            waiverVersionId: waiver.id,
            signedDate: now,
            mediaConsent: false,
          },
        });
      await db.classCategory.create({
        data: { id: prefix, name: 'Gift test', slug: prefix },
      });
      for (const isEvent of [false, true])
        await db.classTemplate.create({
          data: {
            id: prefix + isEvent,
            slug: prefix + isEvent,
            categoryId: prefix,
            name: 'Synthetic gift session',
            description: 'Test only',
            isEvent,
            durationMinutes: 50,
            defaultCapacity: 20,
            tags: [],
            equipment: [],
          },
        });
    });
    afterAll(async () => db.$disconnect());
    it.each(['CLASS', 'EVENT', 'BOTH'] as const)(
      '%s creates one credit under concurrent retry and enforces one shared use',
      async (kind) => {
        const userId = prefix + '-' + kind;
        const input = {
          userId,
          kind,
          requestId: randomUUID(),
          occasion: 'Birthday' as const,
          reason: 'Happy birthday',
          expirationDate,
        };
        const accounts = await Promise.all(
          [1, 2, 3].map(() =>
            db.$transaction((tx) => grantGiftCredit(tx, input, owner)),
          ),
        );
        expect(new Set(accounts.map((a) => a.id)).size).toBe(1);
        const account = accounts[0];
        expect(account).toMatchObject({
          isUnlimited: false,
          sourcePurchaseId: null,
        });
        expect(
          await db.creditLedgerEntry.count({
            where: { creditAccountId: account.id, type: 'GRANT' },
          }),
        ).toBe(1);
        expect(
          await db.auditLog.count({
            where: { entityId: userId, action: 'credit.gift-grant' },
          }),
        ).toBe(1);
        await expect(
          db.$transaction((tx) =>
            grantGiftCredit(
              tx,
              { ...input, kind: kind === 'CLASS' ? 'EVENT' : 'CLASS' },
              owner,
            ),
          ),
        ).rejects.toThrow('different terms');
        expect(await db.purchase.count({ where: { userId } })).toBe(0);
        expect(await db.membership.count({ where: { userId } })).toBe(0);
        expect(await db.emailMessage.count({ where: { userId } })).toBe(0);
        // Try wrong kind and expired occurrence BEFORE consuming the one available gift.
        const cases: Array<[string, Date, boolean, string]> = [
          [
            'expired',
            account.validUntil!,
            kind === 'EVENT',
            'member-no-credit',
          ],
        ];
        if (kind !== 'BOTH')
          cases.push([
            'wrong',
            new Date(+now + 86400000),
            kind === 'CLASS',
            'member-no-credit',
          ]);
        cases.push([
          'right',
          new Date(+now + 2 * 86400000),
          kind === 'EVENT',
          'member-added',
        ]);
        cases.push([
          'second',
          new Date(+now + 3 * 86400000),
          kind !== 'EVENT',
          'member-no-credit',
        ]);
        for (const [name, startAt, isEvent, result] of cases) {
          const occurrenceId = userId + name;
          await db.classOccurrence.create({
            data: {
              id: occurrenceId,
              templateId: prefix + isEvent,
              startAt,
              endAt: new Date(+startAt + 3000000),
              capacity: 20,
            },
          });
          const form = new FormData();
          form.set('occurrenceId', occurrenceId);
          form.set('memberQuery', userId + '@example.test');
          await expect(addMemberToClassAction(form)).rejects.toThrow(
            `result=${result}`,
          );
        }
        expect(
          await db.creditLedgerEntry.aggregate({
            where: { creditAccountId: account.id },
            _sum: { quantity: true },
          }),
        ).toMatchObject({ _sum: { quantity: 0 } });
        expect(
          await db.booking.count({ where: { userId, status: 'CONFIRMED' } }),
        ).toBe(1);
      },
    );
    it('member books either kind with a shared gift, cancels once and retains original expiry', async () => {
      const userId = users[2];
      const account = await db.$transaction((tx) =>
        grantGiftCredit(
          tx,
          {
            userId,
            kind: 'BOTH',
            requestId: randomUUID(),
            occasion: 'Milestone',
            reason: '25 recorded visits',
            expirationDate,
          },
          owner,
        ),
      );
      auth.id = userId;
      auth.role = 'MEMBER';
      const occurrenceId = prefix + 'member-event';
      const startAt = new Date(+now + 5 * 86400000);
      await db.classOccurrence.create({
        data: {
          id: occurrenceId,
          templateId: prefix + true,
          startAt,
          endAt: new Date(+startAt + 3000000),
          capacity: 20,
        },
      });
      const form = new FormData();
      form.set('occurrenceId', occurrenceId);
      await expect(bookOccurrenceAction(form)).rejects.toThrow(
        'result=confirmed',
      );
      const booking = await db.booking.findUniqueOrThrow({
        where: { occurrenceId_userId: { occurrenceId, userId } },
      });
      expect(booking.policySnapshot).toMatchObject({
        accessType: 'STANDARD',
        creditAccountId: account.id,
      });
      const cancel = new FormData();
      cancel.set('bookingId', booking.id);
      await expect(cancelBookingAction(cancel)).rejects.toThrow(
        'result=cancelled-credit',
      );
      await expect(cancelBookingAction(cancel)).rejects.toThrow(
        '/member/bookings',
      );
      expect(
        await db.creditLedgerEntry.count({
          where: { creditAccountId: account.id, type: 'RELEASE' },
        }),
      ).toBe(1);
      expect(
        (
          await db.creditAccount.findUniqueOrThrow({
            where: { id: account.id },
          })
        ).validUntil,
      ).toEqual(account.validUntil);
      const lateId = prefix + 'member-expired';
      await db.classOccurrence.create({
        data: {
          id: lateId,
          templateId: prefix + false,
          startAt: account.validUntil!,
          endAt: new Date(+account.validUntil! + 3000000),
          capacity: 20,
        },
      });
      form.set('occurrenceId', lateId);
      await expect(bookOccurrenceAction(form)).rejects.toThrow('result=access');
      auth.id = owner;
      auth.role = 'OWNER';
    });
    it('denies member grant authority even with forged form inputs', async () => {
      auth.id = users[0];
      auth.role = 'MEMBER';
      const form = new FormData();
      for (const [k, v] of Object.entries({
        userId: users[1],
        kind: 'BOTH',
        requestId: randomUUID(),
        occasion: 'Other',
        reason: 'Forged gift',
        expirationDate,
      }))
        form.set(k, v);
      expect(await grantMemberGiftAction(form)).toMatchObject({ ok: false });
      auth.id = owner;
      auth.role = 'OWNER';
    });
  },
);
