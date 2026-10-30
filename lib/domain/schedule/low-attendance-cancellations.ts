import type { Prisma, PrismaClient } from '@prisma/client';
import { queueEmail } from '@/lib/notifications/email-queue';
import {
  occurrenceInstructorName,
  occurrenceLocalTimeZone,
  occurrenceTitle,
} from './occurrence-management';

type Client = PrismaClient | Prisma.TransactionClient;

const cancellationReason = 'Automatically cancelled: 0 signups 2 hours before class start.';

function classDate(value: Date) {
  return value.toLocaleDateString('en-US', {
    timeZone: occurrenceLocalTimeZone(),
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function classTime(value: Date) {
  return value.toLocaleTimeString('en-US', {
    timeZone: occurrenceLocalTimeZone(),
    hour: 'numeric',
    minute: '2-digit',
  });
}

export async function cancelLowAttendanceOccurrences(
  client: Client,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() + 2 * 60 * 60_000);
  const occurrences = await client.classOccurrence.findMany({
    where: {
      status: 'SCHEDULED',
      startAt: { gt: now, lte: cutoff },
      historicalSignupCount: 0,
      bookings: { none: { status: 'CONFIRMED' } },
    },
    include: {
      template: true,
      instructor: true,
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
    },
    orderBy: { startAt: 'asc' },
    take: 50,
  });

  let cancelled = 0;
  let instructorEmailsQueued = 0;
  const cancelledIds: string[] = [];

  for (const occurrence of occurrences) {
    const claimed = await client.classOccurrence.updateMany({
      where: {
        id: occurrence.id,
        status: 'SCHEDULED',
        historicalSignupCount: 0,
        bookings: { none: { status: 'CONFIRMED' } },
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancellationReason,
      },
    });
    if (!claimed.count) continue;

    cancelled += 1;
    cancelledIds.push(occurrence.id);

    await client.auditLog.create({
      data: {
        action: 'class-occurrence.cancelled.low-attendance-job',
        entityType: 'ClassOccurrence',
        entityId: occurrence.id,
        before: {
          status: occurrence.status,
          startAt: occurrence.startAt,
          confirmedBookings: occurrence._count.bookings,
          historicalSignupCount: occurrence.historicalSignupCount,
        },
        after: {
          status: 'CANCELLED',
          reason: cancellationReason,
          cancelledAt: now,
        },
      },
    });

    if (occurrence.instructor?.email) {
      await queueEmail(client, {
        userId: occurrence.instructor.id,
        to: occurrence.instructor.email,
        subject: `${occurrenceTitle(occurrence)} was automatically cancelled`,
        template: 'CLASS_CANCELLED',
        payload: {
          name: occurrence.instructor.name || 'Instructor',
          className: occurrenceTitle(occurrence),
          instructorName: occurrenceInstructorName(occurrence),
          classDate: classDate(occurrence.startAt),
          classTime: classTime(occurrence.startAt),
          reason: cancellationReason,
          creditResult: 'No members were signed up, so no member credits needed to be returned.',
          bookingsUrl: '/instructor/schedule',
        },
        dedupeKey: `low-attendance-instructor:${occurrence.id}`,
      });
      instructorEmailsQueued += 1;
    }
  }

  return {
    checked: occurrences.length,
    cancelled,
    instructorEmailsQueued,
    cancelledIds,
  };
}

export { cancellationReason as lowAttendanceCancellationReason };
