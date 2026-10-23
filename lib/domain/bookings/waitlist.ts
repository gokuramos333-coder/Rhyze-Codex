import type { Prisma, PrismaClient } from '@prisma/client';
import { WAITLIST_CAPACITY } from './booking-rules';
import { queueEmail } from '@/lib/notifications/email-queue';

export function publicOccurrenceUrl(occurrence: { id: string; template: { isEvent: boolean; slug: string } }) {
  return `/book/${occurrence.template.isEvent ? 'event/' : ''}${occurrence.template.slug}?occurrence=${encodeURIComponent(occurrence.id)}`;
}

/** The caller owns the booking transaction. Queue only; never charge or auto-book. */
export async function notifyWaitlistOpening(tx: Prisma.TransactionClient, occurrenceId: string, releaseKey: string, now = new Date()) {
  const occurrence = await tx.classOccurrence.findUnique({
    where: { id: occurrenceId },
    include: { template: true, instructor: { select: { name: true } }, _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } },
  });
  if (!occurrence || occurrence.status !== 'SCHEDULED' || occurrence.startAt <= now ||
    occurrence._count.bookings + occurrence.historicalSignupCount >= occurrence.capacity) return;
  const waiting = await tx.waitlistEntry.findMany({
    where: { occurrenceId, status: 'WAITING', user: { status: 'ACTIVE', bookings: { none: { occurrenceId, status: { in: ['CONFIRMED', 'ATTENDED'] } } } } },
    include: { user: { select: { email: true, name: true } } },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }], take: WAITLIST_CAPACITY,
  });
  for (const entry of waiting) {
    await queueEmail(tx, {
      userId: entry.userId, to: entry.user.email,
      subject: `A spot opened for ${occurrence.template.name}`, template: 'WAITLIST_SPOT_AVAILABLE',
      payload: {
        name: entry.user.name || 'Rhyzer', className: occurrence.titleOverride || occurrence.template.name,
        instructorName: occurrence.instructor?.name || 'Rhyze instructor',
        classDate: occurrence.startAt.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' }),
        classTime: occurrence.startAt.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }),
        claimUrl: publicOccurrenceUrl(occurrence), occurrenceId,
      },
      dedupeKey: `waitlist-spot-available:${releaseKey}:${entry.id}`,
    });
  }
}

export async function completeWaitlistBooking(tx: Prisma.TransactionClient, occurrenceId: string, userId: string) {
  await tx.waitlistEntry.updateMany({ where: { occurrenceId, userId, status: 'WAITING' }, data: { status: 'PROMOTED', promotedAt: new Date() } });
}

/** A delayed/retried opening email must not advertise an unavailable place. */
export async function waitlistEmailIsDeliverable(client: PrismaClient | Prisma.TransactionClient, message: { template: string; userId: string | null; payload: unknown }, now = new Date()) {
  if (!['WAITLIST_JOINED', 'WAITLIST_SPOT_AVAILABLE'].includes(message.template)) return true;
  const payload = message.payload as { occurrenceId?: string; claimUrl?: string; bookingsUrl?: string } | null;
  // Older messages have a dated URL but no occurrenceId. Never guess from a title.
  let occurrenceId = payload?.occurrenceId;
  if (!occurrenceId) {
    try { occurrenceId = new URL(payload?.claimUrl || payload?.bookingsUrl || '', 'https://www.rhyzefitness.com').searchParams.get('occurrence') || undefined; } catch { return false; }
  }
  if (!occurrenceId || !message.userId) return false;
  const waiting = await client.waitlistEntry.findFirst({
    where: { occurrenceId, userId: message.userId, status: 'WAITING', user: { status: 'ACTIVE', bookings: { none: { occurrenceId, status: { in: ['CONFIRMED', 'ATTENDED'] } } } } },
    include: { occurrence: { include: { _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } } } },
  });
  if (!waiting || waiting.occurrence.status !== 'SCHEDULED' || waiting.occurrence.startAt <= now) return false;
  return message.template === 'WAITLIST_JOINED' || waiting.occurrence._count.bookings + waiting.occurrence.historicalSignupCount < waiting.occurrence.capacity;
}
