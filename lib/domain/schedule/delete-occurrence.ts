import { confirmationReferencesOccurrence } from '@/lib/notifications/booking-confirmation-delivery';
import { Prisma, type PrismaClient } from '@prisma/client';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';
import { queueEmail } from '@/lib/notifications/email-queue';
import { occurrenceTitle } from './occurrence-management';

export type DeleteOccurrenceInput = {
  id: string;
  expectedStartAt: string;
  expectedUpdatedAt: string;
  confirmed: boolean;
};
export class DeleteOccurrenceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Archive one dated occurrence. All local effects commit together; no provider requests. */
export async function deleteScheduledOccurrence(
  db: PrismaClient,
  actorId: string,
  input: DeleteOccurrenceInput,
) {
  if (!input.confirmed) throw new DeleteOccurrenceError('delete-confirm');
  return db.$transaction(
    async (tx) => {
      return deleteScheduledOccurrenceInTransaction(tx, actorId, input);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 30000,
    },
  );
}

async function deleteScheduledOccurrenceInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  input: DeleteOccurrenceInput,
) {
  // Same lock as member booking, plus a row lock for legacy and non-member writers.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.id}))`;
  await tx.$queryRaw`SELECT id FROM "ClassOccurrence" WHERE id=${input.id} FOR UPDATE`;
  const item = await tx.classOccurrence.findUnique({
    where: { id: input.id },
    include: {
      template: true,
      bookings: {
        where: { status: { in: ['CONFIRMED', 'ATTENDED', 'NO_SHOW'] } },
        include: { user: true },
      },
      waitlistEntries: {
        where: { status: 'WAITING' },
        include: { user: true },
      },
      attendanceRecords: true,
    },
  });
  if (!item) throw new DeleteOccurrenceError('delete-missing');
  if (item.archivedAt) return;
  if (
    item.startAt.toISOString() !== input.expectedStartAt ||
    item.updatedAt.toISOString() !== input.expectedUpdatedAt
  )
    throw new DeleteOccurrenceError('delete-stale');
  if (
    (item.startAt <= new Date() && item.bookings.length > 0) ||
    item.status === 'COMPLETED' ||
    item.attendanceRecords.length ||
    item.bookings.some((b) => b.status !== 'CONFIRMED') ||
    item.historicalSignupCount > 0
  )
    throw new DeleteOccurrenceError('delete-history');
  if (
    await tx.commerceOrder.count({
      where: {
        occurrenceId: item.id,
        status: {
          in: ['PENDING', 'PAYMENT_FAILED', 'FULFILLMENT_REVIEW', 'DISPUTED'],
        },
      },
    })
  )
    throw new DeleteOccurrenceError('delete-payment');
  for (const userId of [...new Set(item.bookings.map((b) => b.userId))].sort())
    await lockMembershipEntitlements(tx, userId);
  const now = new Date();
  const title = occurrenceTitle(item);
  const reason =
    'This class date has been removed from the schedule. We apologize for the inconvenience.';
  const recipients = new Map<
    string,
    { email: string; name: string | null; creditResult: string }
  >();
  for (const booking of item.bookings) {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
    const entries = await tx.creditLedgerEntry.findMany({
      where: {
        bookingId: booking.id,
        type: { in: ['RESERVE', 'RELEASE', 'RESTORE'] },
      },
    });
    const balances = new Map<string, number>();
    for (const entry of entries)
      balances.set(
        entry.creditAccountId,
        (balances.get(entry.creditAccountId) || 0) + entry.quantity,
      );
    let returned = 0;
    for (const [creditAccountId, balance] of balances)
      if (balance < 0) {
        await tx.creditLedgerEntry.create({
          data: {
            creditAccountId,
            bookingId: booking.id,
            type: 'RELEASE',
            quantity: -balance,
            reason: 'Studio removed this class date',
          },
        });
        returned -= balance;
      }
    recipients.set(booking.userId, {
      email: booking.user.email,
      name: booking.user.name,
      creditResult: returned
        ? 'Your reserved class credit was returned to its original account with its existing expiry.'
        : 'No reserved class credit needed to be returned. Any cash payment remains on your account for staff to review; no automatic refund was issued.',
    });
    await tx.emailMessage.updateMany({
      where: {
        template: 'CLASS_REMINDER',
        status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] },
        OR: [
          { payload: { path: ['bookingId'], equals: booking.id } },
          { dedupeKey: { startsWith: `class-reminder:${booking.id}:` } },
        ],
      },
      data: { status: 'CANCELLED' },
    });
  }
  for (const entry of item.waitlistEntries)
    if (!recipients.has(entry.userId))
      recipients.set(entry.userId, {
        email: entry.user.email,
        name: entry.user.name,
        creditResult:
          'Your waiting-list entry was removed. No class credit was charged for waiting.',
      });
  await tx.waitlistEntry.updateMany({
    where: { occurrenceId: item.id, status: 'WAITING' },
    data: { status: 'EXPIRED' },
  });
  await tx.classOccurrence.update({
    where: { id: item.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: item.cancelledAt || now,
      cancellationReason: reason,
      archivedAt: now,
    },
  });
  for (const [userId, recipient] of recipients) {
    await queueEmail(tx, {
      userId,
      to: recipient.email,
      subject: `Schedule update: ${title}`,
      template: 'CLASS_CANCELLED',
      payload: {
        name: recipient.name || 'Rhyzer',
        className: title,
        classDate: item.startAt.toLocaleDateString('en-US', {
          timeZone: item.timezone,
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
        classTime: item.startAt.toLocaleTimeString('en-US', {
          timeZone: item.timezone,
          hour: 'numeric',
          minute: '2-digit',
        }),
        reason,
        creditResult: recipient.creditResult,
      },
      dedupeKey: `class-deleted:${item.id}:${userId}`,
    });
    await tx.inAppNotification.upsert({
      where: { dedupeKey: `class-deleted:${item.id}:${userId}` },
      update: {},
      create: {
        userId,
        title: `${title}: schedule update`,
        body: reason,
        link: '/member/bookings',
        dedupeKey: `class-deleted:${item.id}:${userId}`,
      },
    });
  }
  const confirmations = await tx.emailMessage.findMany({
    where: {
      userId: { in: [...recipients.keys()] },
      template: { in: ['BOOKING_CONFIRMATION', 'EVENT_PURCHASE_CONFIRMATION'] },
      status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] },
    },
  });
  const orders = await tx.commerceOrder.findMany({
    where: { occurrenceId: item.id },
    select: { id: true },
  });
  const confirmationIds = confirmations
    .filter(
      (m) =>
        confirmationReferencesOccurrence(
          m,
          item,
          item.bookings.filter((b) => b.userId === m.userId).map((b) => b.id),
        ) ||
        orders.some((o) => m.dedupeKey === `commerce-confirmation:${o.id}`),
    )
    .map((m) => m.id);
  if (confirmationIds.length)
    await tx.emailMessage.updateMany({
      where: {
        id: { in: confirmationIds },
        status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] },
      },
      data: { status: 'CANCELLED' },
    });
  await tx.auditLog.create({
    data: {
      actorId,
      action: 'class-occurrence.deleted-from-schedule',
      entityType: 'ClassOccurrence',
      entityId: item.id,
      before: {
        status: item.status,
        startAt: item.startAt.toISOString(),
        templateId: item.templateId,
      },
      after: {
        archivedAt: now.toISOString(),
        notifiedMembers: recipients.size,
        bookingsCancelled: item.bookings.length,
        waitlistRemoved: item.waitlistEntries.length,
      },
    },
  });
}

export type ScheduleDeletionDate = Omit<DeleteOccurrenceInput, 'confirmed'> & {
  booked: number;
  waiting: number;
};
export type DeleteClassScheduleInput = {
  templateId: string;
  scope: 'one' | 'future';
  dates: ScheduleDeletionDate[];
  confirmed: boolean;
};

/** A reviewed set, removed atomically using the same credit/notification rules as one date. */
export async function deleteClassSchedule(
  db: PrismaClient,
  actorId: string,
  input: DeleteClassScheduleInput,
) {
  if (!input.confirmed) throw new DeleteOccurrenceError('delete-confirm');
  if (
    !['one', 'future'].includes(input.scope) ||
    !input.dates.length ||
    input.dates.length > 200 ||
    (input.scope === 'one' && input.dates.length !== 1) ||
    new Set(input.dates.map((d) => d.id)).size !== input.dates.length
  )
    throw new DeleteOccurrenceError('delete-invalid');
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rhyze-schedule-import'))`;
      for (const id of input.dates.map((d) => d.id).sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        await tx.$queryRaw`SELECT id FROM "ClassOccurrence" WHERE id=${id} FOR UPDATE`;
      }
      const now = new Date();
      const rows = await tx.classOccurrence.findMany({
        where: {
          id: { in: input.dates.map((d) => d.id) },
          templateId: input.templateId,
        },
        include: {
          _count: {
            select: {
              bookings: {
                where: { status: { in: ['CONFIRMED', 'ATTENDED', 'NO_SHOW'] } },
              },
              waitlistEntries: { where: { status: 'WAITING' } },
            },
          },
        },
      });
      if (rows.length !== input.dates.length)
        throw new DeleteOccurrenceError('delete-invalid');
      const active = rows.filter((r) => !r.archivedAt);
      for (const row of active) {
        const expected = input.dates.find((d) => d.id === row.id)!;
        if (row.startAt <= now || row.status === 'COMPLETED')
          throw new DeleteOccurrenceError('delete-history');
        if (
          row.startAt.toISOString() !== expected.expectedStartAt ||
          row.updatedAt.toISOString() !== expected.expectedUpdatedAt ||
          row._count.bookings !== expected.booked ||
          row._count.waitlistEntries !== expected.waiting
        )
          throw new DeleteOccurrenceError('delete-stale');
      }
      if (input.scope === 'future') {
        const future = await tx.classOccurrence.findMany({
          where: {
            templateId: input.templateId,
            archivedAt: null,
            startAt: { gt: now },
          },
          select: { id: true },
        });
        const expectedIds = new Set(active.map((r) => r.id));
        if (
          future.length !== active.length ||
          future.some((r) => !expectedIds.has(r.id))
        )
          throw new DeleteOccurrenceError('delete-stale');
      }
      // Already archived requests do not queue messages or release credits twice.
      if (!active.length) return { removed: 0, alreadyRemoved: rows.length };
      for (const date of input.dates.filter((d) =>
        active.some((r) => r.id === d.id),
      ))
        await deleteScheduledOccurrenceInTransaction(tx, actorId, {
          ...date,
          confirmed: true,
        });
      if (input.scope === 'future')
        await tx.classSeries.updateMany({
          where: { templateId: input.templateId, isActive: true },
          data: { isActive: false },
        });
      return {
        removed: active.length,
        alreadyRemoved: rows.length - active.length,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 30000,
    },
  );
}
