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
async function expectHidden(id: string) {
  expect(await getClientArchive(db, id)).toEqual({
    archived: true,
    effectivelyArchived: true,
    reasons: [],
  });
  expect(await visible(id)).toBeNull();
  expect(await visible(id, 'archived')).not.toBeNull();
  expect(await visible(id, 'all')).not.toBeNull();
}
async function expectBlocked(id: string, archived: boolean, reason: string) {
  expect(await getClientArchive(db, id)).toEqual({
    archived,
    effectivelyArchived: false,
    reasons: [reason],
  });
  expect(await visible(id)).not.toBeNull();
  expect(await visible(id, 'archived')).toBeNull();
  expect(await visible(id, 'all')).not.toBeNull();
  await expect(changeClientArchive(db, owner, id, 'archive')).rejects.toThrow(
    reason,
  );
  expect(
    (await db.user.findUniqueOrThrow({ where: { id } })).archivedAt !== null,
  ).toBe(archived);
}
async function historicalOccurrence(status: 'SCHEDULED' | 'COMPLETED') {
  return db.classOccurrence.create({
    data: {
      templateId: (
        await db.classOccurrence.findUniqueOrThrow({
          where: { id: occurrence },
        })
      ).templateId,
      startAt: new Date(+past - 3600000),
      endAt: past,
      capacity: 20,
      status,
    },
  });
}
type TransferFeeChannel = 'instructor' | 'member';
type TransferFeeEvidence =
  | 'exact retry'
  | 'unrelated success'
  | 'different destination'
  | 'different source'
  | 'different payment intent'
  | 'earlier successful transfer'
  | 'another failed destination';

async function transferFeeRetryHistory(
  userId: string,
  channel: TransferFeeChannel,
  evidence: TransferFeeEvidence = 'exact retry',
) {
  const source = await historicalOccurrence('COMPLETED');
  const destination = await historicalOccurrence('COMPLETED');
  const other = await historicalOccurrence('COMPLETED');
  const instructor = await db.user.create({
    data: { email: `${randomUUID()}@example.test`, role: 'INSTRUCTOR' },
  });
  await db.classOccurrence.update({
    where: { id: source.id },
    data: { instructorId: instructor.id },
  });
  const customerId = `cus_${randomUUID()}`;
  await db.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customerId },
  });
  // Both attempts were inside the STANDARD paid-transfer window (2–6 hours).
  const failedAt = new Date(+source.startAt - 4 * 3600000);
  const succeededAt = new Date(
    +failedAt + (evidence === 'earlier successful transfer' ? -60000 : 60000),
  );
  const booking = await db.booking.create({
    data: {
      userId,
      occurrenceId: source.id,
      status: 'CONFIRMED',
      bookedAt: new Date(+failedAt - 3600000),
      createdAt: new Date(+failedAt - 3600000),
      policySnapshot: {
        accessType: 'STANDARD',
        accessProductKind: 'CLASS_PACK',
      },
    },
  });
  const keyPrefix =
    channel === 'member' ? 'member-transfer-fee' : 'transfer-fee';
  const reason = channel === 'member' ? 'Member self-reschedule' : null;

  async function failedAttempt(toOccurrenceId: string) {
    // attendance-fee.ts retains this exact key and a null intent on failure.
    // Instructor actions also retain PAYMENT_FAILED history; member actions do not.
    await db.paymentRecord.create({
      data: {
        userId,
        bookingId: booking.id,
        kind: 'TRANSFER_FEE',
        status: 'FAILED',
        amountCents: 500,
        stripeEventId: `attendance-fee-failed:TRANSFER:${keyPrefix}-${booking.id}-${source.id}-${toOccurrenceId}`,
        stripeCustomerId: customerId,
        stripePaymentIntentId: null,
        occurredAt: failedAt,
        createdAt: failedAt,
        updatedAt: failedAt,
      },
    });
    if (channel === 'instructor') {
      await db.bookingTransfer.create({
        data: {
          bookingId: booking.id,
          memberId: userId,
          instructorId: instructor.id,
          fromOccurrenceId: source.id,
          toOccurrenceId,
          status: 'PAYMENT_FAILED',
          feeCents: 500,
          reason,
          createdAt: new Date(+failedAt + 1000),
        },
      });
    }
  }

  await failedAttempt(destination.id);
  if (evidence === 'another failed destination') await failedAttempt(other.id);
  const paymentIntentId = `pi_${randomUUID()}`;
  const payment = await db.paymentRecord.create({
    data: {
      userId,
      bookingId: booking.id,
      kind: 'TRANSFER_FEE',
      status: 'SUCCEEDED',
      amountCents: 500,
      stripeEventId: `attendance-fee:${paymentIntentId}`,
      stripeCustomerId: customerId,
      stripePaymentIntentId: paymentIntentId,
      occurredAt: succeededAt,
      createdAt: succeededAt,
      updatedAt: succeededAt,
    },
  });
  if (evidence !== 'unrelated success') {
    const fromOccurrenceId =
      evidence === 'different source' ? other.id : source.id;
    const toOccurrenceId =
      evidence === 'different destination' ? other.id : destination.id;
    const transferredAt = new Date(+succeededAt + 1000);
    await db.bookingTransfer.create({
      data: {
        bookingId: booking.id,
        memberId: userId,
        instructorId: instructor.id,
        fromOccurrenceId,
        toOccurrenceId,
        status: 'COMPLETED',
        feeCents: 500,
        stripePaymentIntentId:
          evidence === 'different payment intent'
            ? `pi_${randomUUID()}`
            : paymentIntentId,
        reason,
        createdAt: transferredAt,
      },
    });
    await db.booking.update({
      where: { id: booking.id },
      data: {
        occurrenceId: toOccurrenceId,
        policySnapshot: {
          accessType: 'STANDARD',
          accessProductKind: 'CLASS_PACK',
          transferredFrom: fromOccurrenceId,
          transferredAt: transferredAt.toISOString(),
          transferRequestedBy: channel === 'member' ? 'MEMBER' : 'INSTRUCTOR',
        },
      },
    });
  }
  // The class has since finished: isolate payment proof from future obligations.
  await db.booking.update({
    where: { id: booking.id },
    data: { status: 'ATTENDED' },
  });
  return { bookingId: booking.id, paymentId: payment.id };
}

async function retainedTransferFeeHistory(bookingId: string) {
  return {
    booking: await db.booking.findUniqueOrThrow({ where: { id: bookingId } }),
    payments: await db.paymentRecord.findMany({
      where: { bookingId },
      orderBy: { id: 'asc' },
    }),
    transfers: await db.bookingTransfer.findMany({
      where: { bookingId },
      orderBy: { id: 'asc' },
    }),
  };
}
async function planChange(membershipId: string, active: boolean) {
  return db.membershipPlanChange.create({
    data: {
      membershipId,
      activeMembershipId: active ? membershipId : null,
      fromProductId: product,
      toProductId: product,
      actorId: owner,
      status: active ? 'SUBMITTED' : 'CANCELLED',
      timing: 'IMMEDIATE',
      effectiveAt: past,
      periodStart: new Date(+past - 86400000),
      periodEnd: past,
      expiresAt: past,
      stripeSubscriptionId: `sub_${randomUUID()}`,
      stripeCustomerId: `cus_${randomUUID()}`,
      stripeItemId: `si_${randomUUID()}`,
      fromPriceId: 'price_previous',
      toPriceId: 'price_next',
      quote: {},
      submittedAt: past,
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
  it.each(['balance', 'unlimited', 'gift'] as const)(
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
            type: 'GRANT',
            quantity: 1,
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
  it.each([
    { validUntil: past, settlement: null },
    { validUntil: future, settlement: null },
    { validUntil: past, settlement: 'RELEASE' },
    { validUntil: future, settlement: 'RELEASE' },
    { validUntil: past, settlement: 'RESTORE' },
    { validUntil: future, settlement: 'RESTORE' },
  ] as const)(
    'blocks an outstanding reservation at zero balance (expiry $validUntil, earlier return $settlement)',
    async ({ validUntil, settlement }) => {
      const u = await member();
      await changeClientArchive(db, owner, u.id, 'archive');
      // An overdue CONFIRMED booking isolates reservations from future bookings.
      const history = await historicalOccurrence('SCHEDULED');
      const booking = await db.booking.create({
        data: { userId: u.id, occurrenceId: history.id, status: 'CONFIRMED' },
      });
      const account = await db.creditAccount.create({
        data: {
          userId: u.id,
          label: 'Outstanding reservation',
          validFrom: new Date(+past - 86400000),
          validUntil,
          entries: {
            create: [
              { type: 'GRANT', quantity: 1, createdAt: new Date(+past - 4000) },
              {
                type: 'RESERVE',
                quantity: -1,
                bookingId: booking.id,
                createdAt: new Date(+past - 3000),
              },
              ...(settlement
                ? [
                    {
                      type: settlement,
                      quantity: 1,
                      bookingId: booking.id,
                      createdAt: new Date(+past - 2000),
                    },
                    {
                      type: 'RESERVE' as const,
                      quantity: -1,
                      bookingId: booking.id,
                      createdAt: new Date(+past - 1000),
                    },
                  ]
                : []),
            ],
          },
        },
      });
      const entries = await db.creditLedgerEntry.findMany({
        where: { creditAccountId: account.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(0);
      await expectBlocked(u.id, true, 'Credits or access obligations');
      expect(
        await db.creditLedgerEntry.findMany({
          where: { creditAccountId: account.id },
          orderBy: { createdAt: 'asc' },
        }),
      ).toEqual(entries);
      expect(
        await db.booking.findUnique({ where: { id: booking.id } }),
      ).toEqual(booking);
    },
  );
  it.each(['RELEASE', 'RESTORE'] as const)(
    'permits an expired reservation fully returned by %s',
    async (settlement) => {
      const u = await member();
      const history = await historicalOccurrence('SCHEDULED');
      const booking = await db.booking.create({
        data: { userId: u.id, occurrenceId: history.id, status: 'CANCELLED' },
      });
      await db.creditAccount.create({
        data: {
          userId: u.id,
          label: 'Returned reservation',
          validUntil: past,
          entries: {
            create: [
              { type: 'GRANT', quantity: 1 },
              { type: 'RESERVE', quantity: -1, bookingId: booking.id },
              { type: settlement, quantity: 1, bookingId: booking.id },
            ],
          },
        },
      });
      await changeClientArchive(db, owner, u.id, 'archive');
      await expectHidden(u.id);
    },
  );
  it.each(['ATTENDED', 'NO_SHOW', 'LATE_CANCELLED'] as const)(
    'permits an expired zero-balance RESERVE for historical %s without a settlement entry',
    async (status) => {
      const u = await member();
      const account = await db.creditAccount.create({
        data: {
          userId: u.id,
          label: 'Expired',
          validFrom: new Date(+past - 86400000),
          validUntil: past,
          entries: { create: { type: 'GRANT', quantity: 1 } },
        },
      });
      const history = await historicalOccurrence('COMPLETED');
      const booking = await db.booking.create({
        data: { userId: u.id, occurrenceId: history.id, status },
      });
      await db.creditLedgerEntry.create({
        data: {
          creditAccountId: account.id,
          type: 'RESERVE',
          quantity: -1,
          bookingId: booking.id,
        },
      });
      const attendance = await db.attendanceRecord.create({
        data: {
          userId: u.id,
          occurrenceId: history.id,
          bookingId: booking.id,
          status,
        },
      });
      const entries = await db.creditLedgerEntry.findMany({
        where: { creditAccountId: account.id },
        orderBy: { id: 'asc' },
      });
      expect(entries.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(0);
      await changeClientArchive(db, owner, u.id, 'archive');
      await expectHidden(u.id);
      expect(
        await db.booking.findUnique({ where: { id: booking.id } }),
      ).toEqual(booking);
      expect(
        await db.attendanceRecord.findUnique({ where: { id: attendance.id } }),
      ).toEqual(attendance);
      expect(
        await db.creditAccount.findUnique({ where: { id: account.id } }),
      ).toEqual(account);
      expect(
        await db.creditLedgerEntry.findMany({
          where: { creditAccountId: account.id },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(entries);
    },
  );
  // RED target: the current blanket FAILED predicate rejects these exact retries.
  // A booking/kind/amount-only exemption must still fail the negative cases below.
  it.each([
    { channel: 'instructor', archived: false },
    { channel: 'instructor', archived: true },
    { channel: 'member', archived: false },
    { channel: 'member', archived: true },
  ] as const)(
    'permits an exact settled transfer-fee retry ($channel, archived $archived) without rewriting history',
    async ({ channel, archived }) => {
      const u = await member();
      if (archived) await changeClientArchive(db, owner, u.id, 'archive');
      const fixture = await transferFeeRetryHistory(u.id, channel);
      const retained = await retainedTransferFeeHistory(fixture.bookingId);
      expect(retained.payments).toHaveLength(2);
      expect(retained.transfers).toHaveLength(channel === 'instructor' ? 2 : 1);
      expect(await getClientArchive(db, u.id)).toEqual({
        archived,
        effectivelyArchived: archived,
        reasons: [],
      });
      await changeClientArchive(db, owner, u.id, 'archive');
      await expectHidden(u.id);
      await changeClientArchive(db, owner, u.id, 'restore');
      expect(await visible(u.id)).not.toBeNull();
      expect(await retainedTransferFeeHistory(fixture.bookingId)).toEqual(
        retained,
      );
    },
  );
  it.each([
    'unrelated success',
    'different destination',
    'different source',
    'different payment intent',
    'earlier successful transfer',
    'another failed destination',
  ] as const)(
    'keeps transfer-fee failure outstanding with %s despite the same booking/kind/amount',
    async (evidence) => {
      for (const archived of [false, true]) {
        const u = await member();
        if (archived) await changeClientArchive(db, owner, u.id, 'archive');
        const fixture = await transferFeeRetryHistory(
          u.id,
          'instructor',
          evidence,
        );
        const retained = await retainedTransferFeeHistory(fixture.bookingId);
        await expectBlocked(
          u.id,
          archived,
          'Active billing or unresolved payment',
        );
        expect(await retainedTransferFeeHistory(fixture.bookingId)).toEqual(
          retained,
        );
      }
    },
  );
  it.each([
    { status: 'REFUNDED', refundedAmountCents: 500 },
    { status: 'PARTIALLY_REFUNDED', refundedAmountCents: 100 },
    { status: 'DISPUTED', refundedAmountCents: 0 },
    { status: 'SUCCEEDED', refundedAmountCents: 100 },
  ] as const)(
    'does not settle a transfer-fee failure with $status / $refundedAmountCents refunded',
    async ({ status, refundedAmountCents }) => {
      for (const archived of [false, true]) {
        const u = await member();
        if (archived) await changeClientArchive(db, owner, u.id, 'archive');
        const fixture = await transferFeeRetryHistory(u.id, 'member');
        await db.paymentRecord.update({
          where: { id: fixture.paymentId },
          data: { status, refundedAmountCents },
        });
        const retained = await retainedTransferFeeHistory(fixture.bookingId);
        await expectBlocked(
          u.id,
          archived,
          'Active billing or unresolved payment',
        );
        expect(await retainedTransferFeeHistory(fixture.bookingId)).toEqual(
          retained,
        );
      }
    },
  );
  it.each([
    { archived: false, guest: false },
    { archived: true, guest: false },
    { archived: false, guest: true },
    { archived: true, guest: true },
  ])(
    'blocks failed refunds on paid orders (archived $archived, guest $guest)',
    async ({ archived, guest }) => {
      const u = await member();
      if (archived) await changeClientArchive(db, owner, u.id, 'archive');
      const order = await db.commerceOrder.create({
        data: {
          userId: guest ? null : u.id,
          customerEmail: ` ${u.email.toUpperCase()} `,
          kind: 'MERCHANDISE',
          status: 'PAID',
          amountCents: 100,
          paidAt: past,
        },
      });
      const refund = await db.commerceRefund.create({
        data: {
          commerceOrderId: order.id,
          amountCents: 100,
          status: 'FAILED',
          providerStatus: 'failed',
          failureReason: 'Synthetic provider failure',
        },
      });
      await expectBlocked(
        u.id,
        archived,
        'Active billing or unresolved payment',
      );
      expect(
        await db.commerceOrder.findUnique({ where: { id: order.id } }),
      ).toEqual(order);
      expect(
        await db.commerceRefund.findUnique({ where: { id: refund.id } }),
      ).toEqual(refund);
    },
  );
  it('permits cancelled membership with historical planChangeState and an inactive plan change', async () => {
    const u = await member();
    const membership = await db.membership.create({
      data: {
        userId: u.id,
        productId: product,
        status: 'CANCELLED',
        currentPeriodStart: new Date(+past - 86400000),
        currentPeriodEnd: past,
        planChangeState: {
          paidStart: 1,
          paidEnd: 2,
          paidAt: 1,
          lifecycleAt: 3,
          restrictiveAt: 3,
        },
      },
    });
    const operation = await planChange(membership.id, false);
    await changeClientArchive(db, owner, u.id, 'archive');
    await expectHidden(u.id);
    expect(
      await db.membership.findUnique({ where: { id: membership.id } }),
    ).toEqual(membership);
    expect(
      await db.membershipPlanChange.findUnique({ where: { id: operation.id } }),
    ).toEqual(operation);
  });
  it.each([
    'plan change',
    'billing lock',
    'billing review',
    'pending request',
    'freeze',
  ] as const)(
    'blocks cancelled membership with an active %s and resurfaces the client',
    async (kind) => {
      const u = await member();
      await changeClientArchive(db, owner, u.id, 'archive');
      const membership = await db.membership.create({
        data: {
          userId: u.id,
          productId: product,
          status: 'CANCELLED',
          currentPeriodStart: past,
          currentPeriodEnd: past,
          billingLockToken: kind === 'billing lock' ? randomUUID() : null,
          billingLockNeedsReview: kind === 'billing review',
        },
      });
      if (kind === 'plan change') await planChange(membership.id, true);
      if (kind === 'pending request')
        await db.membershipChangeRequest.create({
          data: {
            userId: u.id,
            membershipId: membership.id,
            type: 'CHANGE',
            status: 'PENDING',
          },
        });
      if (kind === 'freeze')
        await db.membershipFreeze.create({
          data: {
            membershipId: membership.id,
            createdById: owner,
            startAt: past,
            endAt: future,
          },
        });
      await expectBlocked(u.id, true, 'Active billing or unresolved payment');
    },
  );
  it('permits a settled one-time Stripe customer without any membership', async () => {
    const u = await member();
    const customer = await db.user.update({
      where: { id: u.id },
      data: { stripeCustomerId: `cus_${randomUUID()}` },
    });
    const order = await db.commerceOrder.create({
      data: {
        userId: u.id,
        kind: 'MERCHANDISE',
        status: 'PAID',
        amountCents: 100,
        paidAt: past,
      },
    });
    const payment = await db.paymentRecord.create({
      data: {
        userId: u.id,
        commerceOrderId: order.id,
        kind: 'MERCHANDISE',
        status: 'SUCCEEDED',
        amountCents: 100,
        stripeEventId: randomUUID(),
        stripeCustomerId: customer.stripeCustomerId,
      },
    });
    expect(await db.membership.count({ where: { userId: u.id } })).toBe(0);
    await changeClientArchive(db, owner, u.id, 'archive');
    await expectHidden(u.id);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: u.id } }))
        .stripeCustomerId,
    ).toBe(customer.stripeCustomerId);
    expect(
      await db.commerceOrder.findUnique({ where: { id: order.id } }),
    ).toEqual(order);
    expect(
      await db.paymentRecord.findUnique({ where: { id: payment.id } }),
    ).toEqual(payment);
  });
  it.each(['FAILED', 'DISPUTED'] as const)(
    'blocks a one-time Stripe customer with an unresolved %s payment',
    async (status) => {
      const u = await member();
      await changeClientArchive(db, owner, u.id, 'archive');
      const customer = await db.user.update({
        where: { id: u.id },
        data: { stripeCustomerId: `cus_${randomUUID()}` },
      });
      await db.paymentRecord.create({
        data: {
          userId: u.id,
          kind: 'MERCHANDISE',
          status,
          amountCents: 100,
          stripeEventId: randomUUID(),
          stripeCustomerId: customer.stripeCustomerId,
        },
      });
      await expectBlocked(u.id, true, 'Active billing or unresolved payment');
    },
  );
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
