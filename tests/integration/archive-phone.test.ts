import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { archiveTestDatabase } from '@/scripts/release/archive-test-database';
import {
  changeClientArchive,
  getClientArchive,
  clientArchiveVisibilityWhere,
} from '@/lib/domain/accounts/client-archive';
import { buildClientDirectoryWhere } from '@/lib/admin/client-directory-filters';
import { updateProfile } from '@/lib/domain/accounts/profile-update';
const config = archiveTestDatabase(process.env);
const db = new PrismaClient({ datasourceUrl: config.url });
const prefix = 'archive-' + randomUUID();
const now = new Date();
const future = new Date(+now + 86400000);
const past = new Date(+now - 86400000);
let owner: string, product: string, occurrence: string;
async function member() {
  return db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      name: 'Synthetic Archive Client',
      passwordHash: 'preserved',
      credentialsUpdatedAt: past,
    },
  });
}
async function visible(id: string, archive = '') {
  return db.user.findFirst({
    where: {
      AND: [
        buildClientDirectoryWhere({ q: 'Synthetic Archive' }),
        await clientArchiveVisibilityWhere(db, archive),
        { id },
      ],
    },
  });
}
describe('safe archive and phone against native PostgreSQL', () => {
  beforeAll(async () => {
    config.assertIdentity(
      await db.$queryRaw`SELECT current_setting('data_directory') AS dir, current_setting('port')::int AS port, current_database() AS db, inet_server_addr()::text AS addr, current_user AS "user"`,
    );
    // Verify the real field migration is present before fixture writes.
    expect(
      await db.$queryRaw`SELECT is_nullable, data_type FROM information_schema.columns WHERE table_name='User' AND column_name='archivedAt'`,
    ).toEqual([
      { is_nullable: 'YES', data_type: 'timestamp without time zone' },
    ]);
    owner = (
      await db.user.create({
        data: {
          email: 'automation-admin@rhyze.local',
          role: 'OWNER',
          status: 'ACTIVE',
        },
      })
    ).id;
    product = (
      await db.product.create({
        data: {
          name: prefix,
          slug: prefix,
          description: 'Synthetic',
          kind: 'CLASS_PACK',
          priceCents: 100,
          eligibleCategoryIds: [],
        },
      })
    ).id;
    const category = await db.classCategory.create({
      data: { name: prefix, slug: prefix },
    });
    const template = await db.classTemplate.create({
      data: {
        name: prefix,
        slug: prefix,
        description: 'Synthetic',
        categoryId: category.id,
        durationMinutes: 50,
        defaultCapacity: 20,
        tags: [],
      },
    });
    occurrence = (
      await db.classOccurrence.create({
        data: {
          templateId: template.id,
          startAt: future,
          endAt: new Date(+future + 3600000),
          capacity: 20,
        },
      })
    ).id;
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  it('archives/restores idempotently without changing auth, profile or payment history', async () => {
    const u = await member();
    const payment = await db.paymentRecord.create({
      data: {
        userId: u.id,
        kind: 'PRODUCT_PURCHASE',
        status: 'SUCCEEDED',
        amountCents: 2000,
        stripeEventId: randomUUID(),
      },
    });
    await changeClientArchive(db, owner, u.id, 'archive');
    await changeClientArchive(db, owner, u.id, 'archive');
    expect(await getClientArchive(db, u.id)).toMatchObject({
      archived: true,
      effectivelyArchived: true,
      reasons: [],
    });
    expect(await visible(u.id)).toBeNull();
    expect(await visible(u.id, 'archived')).not.toBeNull();
    expect(await visible(u.id, 'all')).not.toBeNull();
    expect(await db.user.findUnique({ where: { id: u.id } })).toMatchObject({
      role: u.role,
      status: u.status,
      passwordHash: u.passwordHash,
      credentialsUpdatedAt: u.credentialsUpdatedAt,
    });
    expect(
      await db.paymentRecord.findUnique({ where: { id: payment.id } }),
    ).toEqual(payment);
    await changeClientArchive(db, owner, u.id, 'restore');
    await changeClientArchive(db, owner, u.id, 'restore');
    expect(await visible(u.id)).not.toBeNull();
    expect(
      await db.auditLog.count({
        where: { entityId: u.id, action: { startsWith: 'client.directory.' } },
      }),
    ).toBe(2);
  });
  it('rejects unauthorized actors, staff targets and unsupported operations', async () => {
    const u = await member();
    await expect(
      changeClientArchive(db, u.id, u.id, 'archive'),
    ).rejects.toThrow('Not authorized');
    await expect(
      changeClientArchive(db, owner, owner, 'archive'),
    ).rejects.toThrow('MEMBER');
    await expect(
      changeClientArchive(db, owner, u.id, 'delete' as 'archive'),
    ).rejects.toThrow('Invalid');
    await db.user.update({
      where: { id: owner },
      data: { status: 'SUSPENDED' },
    });
    await expect(
      changeClientArchive(db, owner, u.id, 'archive'),
    ).rejects.toThrow('Not authorized');
    await db.user.update({ where: { id: owner }, data: { status: 'ACTIVE' } });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: u.id } })).archivedAt,
    ).toBeNull();
  });
  it.each(['ACTIVE', 'TRIALING', 'PAUSED', 'PAST_DUE'] as const)(
    'blocks %s membership and immediately resurfaces later obligations',
    async (status) => {
      const u = await member();
      await changeClientArchive(db, owner, u.id, 'archive');
      await db.membership.create({
        data: {
          userId: u.id,
          productId: product,
          status,
          currentPeriodStart: now,
        },
      });
      expect(await visible(u.id)).not.toBeNull();
      expect(await visible(u.id, 'archived')).toBeNull();
      await expect(
        changeClientArchive(db, owner, u.id, 'archive'),
      ).rejects.toThrow('billing');
      await changeClientArchive(db, owner, u.id, 'restore');
    },
  );
  it.each(['booking', 'waitlist'] as const)(
    'blocks future %s, retains roster rows and resurfaces after archive',
    async (kind) => {
      const u = await member();
      await changeClientArchive(db, owner, u.id, 'archive');
      if (kind === 'booking')
        await db.booking.create({
          data: { occurrenceId: occurrence, userId: u.id, status: 'CONFIRMED' },
        });
      else
        await db.waitlistEntry.create({
          data: { occurrenceId: occurrence, userId: u.id },
        });
      expect(await visible(u.id)).not.toBeNull();
      await expect(
        changeClientArchive(db, owner, u.id, 'archive'),
      ).rejects.toThrow('bookings');
      expect(await db.user.findUnique({ where: { id: u.id } })).toMatchObject({
        status: 'ACTIVE',
        archivedAt: expect.any(Date),
      });
    },
  );
  it.each(['balance', 'unlimited', 'reservation', 'gift'] as const)(
    'blocks %s credit obligations without altering the ledger',
    async (kind) => {
      const u = await member();
      await changeClientArchive(db, owner, u.id, 'archive');
      const account = await db.creditAccount.create({
        data: {
          userId: u.id,
          label: kind === 'gift' ? 'Gift: BOTH' : 'Synthetic',
          isUnlimited: kind === 'unlimited',
          validUntil: future,
        },
      });
      if (kind !== 'unlimited')
        await db.creditLedgerEntry.create({
          data: {
            creditAccountId: account.id,
            type: kind === 'reservation' ? 'RESERVE' : 'GRANT',
            quantity: kind === 'reservation' ? -1 : 1,
            bookingId: kind === 'reservation' ? randomUUID() : null,
          },
        });
      const entries = await db.creditLedgerEntry.findMany({
        where: { creditAccountId: account.id },
      });
      expect(await visible(u.id)).not.toBeNull();
      await expect(
        changeClientArchive(db, owner, u.id, 'archive'),
      ).rejects.toThrow('Credits');
      expect(
        await db.creditLedgerEntry.findMany({
          where: { creditAccountId: account.id },
        }),
      ).toEqual(entries);
    },
  );
  it('permits expired settled credits and historical attendance without deleting either', async () => {
    const u = await member();
    const account = await db.creditAccount.create({
      data: {
        userId: u.id,
        label: 'Expired',
        validUntil: past,
        entries: { create: { type: 'GRANT', quantity: 1 } },
      },
    });
    const history = await db.classOccurrence.create({
      data: {
        templateId: (
          await db.classOccurrence.findUniqueOrThrow({
            where: { id: occurrence },
          })
        ).templateId,
        startAt: new Date(+past - 3600000),
        endAt: past,
        capacity: 20,
        status: 'COMPLETED',
      },
    });
    const booking = await db.booking.create({
      data: { userId: u.id, occurrenceId: history.id, status: 'ATTENDED' },
    });
    const attendance = await db.attendanceRecord.create({
      data: {
        userId: u.id,
        occurrenceId: history.id,
        bookingId: booking.id,
        status: 'ATTENDED',
      },
    });
    await changeClientArchive(db, owner, u.id, 'archive');
    expect(await db.booking.findUnique({ where: { id: booking.id } })).toEqual(
      booking,
    );
    expect(
      await db.attendanceRecord.findUnique({ where: { id: attendance.id } }),
    ).toEqual(attendance);
    expect(
      await db.creditAccount.findUnique({ where: { id: account.id } }),
    ).toEqual(account);
  });
  it.each([
    'pending purchase',
    'failed payment',
    'guest dispute',
    'pending order',
    'billing review',
  ] as const)('blocks %s', async (kind) => {
    const u = await member();
    if (kind === 'pending purchase')
      await db.purchase.create({
        data: {
          userId: u.id,
          productId: product,
          status: 'PENDING',
          amountCents: 100,
        },
      });
    if (kind === 'failed payment' || kind === 'guest dispute')
      await db.paymentRecord.create({
        data: {
          userId: kind === 'guest dispute' ? null : u.id,
          customerEmail: u.email.toUpperCase(),
          kind: 'PRODUCT_PURCHASE',
          status: kind === 'guest dispute' ? 'DISPUTED' : 'FAILED',
          amountCents: 100,
          stripeEventId: randomUUID(),
        },
      });
    if (kind === 'pending order')
      await db.commerceOrder.create({
        data: {
          userId: u.id,
          kind: 'EVENT',
          status: 'PENDING',
          amountCents: 100,
        },
      });
    if (kind === 'billing review')
      await db.membership.create({
        data: {
          userId: u.id,
          productId: product,
          status: 'CANCELLED',
          currentPeriodStart: past,
          billingLockNeedsReview: true,
        },
      });
    await expect(
      changeClientArchive(db, owner, u.id, 'archive'),
    ).rejects.toThrow('billing');
    expect(await visible(u.id)).not.toBeNull();
  });
  it('updates only changed profile fields and rolls back invalid new phone values', async () => {
    const u = await member();
    const profile = await db.memberProfile.create({
      data: {
        userId: u.id,
        phone: ' bad@example.com ',
        emergencyContactPhone: 'invalid old',
        emergencyContactName: 'Old name',
        dateOfBirth: new Date('1985-04-12T12:00:00Z'),
      },
    });
    const form = new FormData();
    Object.entries({
      preferredName: 'Updated',
      phone: profile.phone!,
      emergencyContactPhone: profile.emergencyContactPhone!,
      emergencyContactName: profile.emergencyContactName!,
      birthdayMonth: '4',
      birthdayDay: '12',
    }).forEach(([k, v]) => form.set(k, v));
    await updateProfile(db, u.id, form);
    expect(
      await db.memberProfile.findUnique({ where: { userId: u.id } }),
    ).toMatchObject({
      preferredName: 'Updated',
      phone: profile.phone,
      emergencyContactPhone: profile.emergencyContactPhone,
      dateOfBirth: profile.dateOfBirth,
    });
    form.set('preferredName', 'Must not persist');
    form.set('phone', 'new@example.com');
    await expect(updateProfile(db, u.id, form)).rejects.toThrow();
    expect(
      await db.memberProfile.findUnique({ where: { userId: u.id } }),
    ).toMatchObject({ preferredName: 'Updated', phone: profile.phone });
  });
});
