import { lockOccurrenceWrites, lockBookingWrites } from '@/lib/domain/bookings/write-fence';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
import type { PrismaClient } from '@prisma/client';
import { queueEmail } from '@/lib/notifications/email-queue';
import { occurrenceLocalTimeZone, occurrenceTitle } from './occurrence-management';

function classDate(value: Date) {
  return value.toLocaleDateString('en-US', {
    timeZone: occurrenceLocalTimeZone(), weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function classTime(value: Date) {
  return value.toLocaleTimeString('en-US', {
    timeZone: occurrenceLocalTimeZone(), hour: 'numeric', minute: '2-digit',
  });
}

export async function cancelOccurrencesWithNotifications(
  prisma: PrismaClient,
  actorId: string,
  occurrenceIds: string[],
  reason: string,
) {
  await retrySerializableTransaction(() => prisma.$transaction(async (tx) => {
    // Acquire ALL parents before any child; transfers lock the same sorted set.
    const ids = [...new Set(occurrenceIds)].sort();
    for (const id of ids) await lockOccurrenceWrites(tx, id);
    for (const id of ids) {
      const occurrence = await tx.classOccurrence.findFirst({
        where: { id, status: 'SCHEDULED' },
        include: { template: true },
      });
      if (!occurrence) continue;
      const candidates = await tx.booking.findMany({ where: { occurrenceId: id, status: 'CONFIRMED' }, orderBy: { id: 'asc' } });
      const bookings = [];
      for (const candidate of candidates) {
        await lockBookingWrites(tx, candidate.id);
        const booking = await tx.booking.findFirst({ where: { id: candidate.id, occurrenceId: id, status: 'CONFIRMED' }, include: { user: true } });
        if (booking) bookings.push(booking);
      }
      await tx.classOccurrence.update({
        where: { id: occurrence.id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
      });
      for (const booking of bookings) {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
        await tx.attendanceRecord.deleteMany({ where: { bookingId: booking.id } });
        await tx.emailMessage.updateMany({
          where: { dedupeKey: `class-reminder:${booking.id}:${occurrence.id}`, template: 'CLASS_REMINDER', status: { in: ['QUEUED', 'PROCESSING'] } },
          data: { status: 'CANCELLED' },
        });
        const reservation = await tx.creditLedgerEntry.findFirst({
          where: { bookingId: booking.id, type: 'RESERVE' },
        });
        if (reservation) {
          const released = await tx.creditLedgerEntry.findFirst({
            where: { bookingId: booking.id, type: { in: ['RELEASE', 'RESTORE'] } },
          });
          if (!released) {
            await tx.creditLedgerEntry.create({
              data: {
                creditAccountId: reservation.creditAccountId,
                bookingId: booking.id,
                type: 'RELEASE',
                quantity: 1,
                reason: 'Studio cancelled class',
              },
            });
          }
        }
        await tx.inAppNotification.upsert({
          where: { dedupeKey: `class-cancelled:${occurrence.id}:${booking.userId}` },
          update: {},
          create: {
            userId: booking.userId,
            title: `${occurrenceTitle(occurrence)} was cancelled`,
            body: reason,
            link: '/member/bookings',
            dedupeKey: `class-cancelled:${occurrence.id}:${booking.userId}`,
          },
        });
        await queueEmail(tx, {
          userId: booking.userId,
          to: booking.user.email,
          subject: `${occurrence.template.name} was cancelled`,
          template: 'CLASS_CANCELLED',
          payload: {
            name: booking.user.name || 'Rhyzer',
            className: occurrenceTitle(occurrence),
            classDate: classDate(occurrence.startAt),
            classTime: classTime(occurrence.startAt),
            reason,
            creditResult: 'Your eligible class credit was returned automatically.',
          },
          dedupeKey: `class-cancelled-email:${occurrence.id}:${booking.userId}`,
        });
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'class.cancelled.by-management',
          entityType: 'ClassOccurrence',
          entityId: occurrence.id,
          after: { reason, notifiedMembers: bookings.length },
        },
      });
    }
  }, { timeout: 15000 }));
}
