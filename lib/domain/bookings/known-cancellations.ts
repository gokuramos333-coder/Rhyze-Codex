import type { Prisma } from '@prisma/client';

const KNOWN_CANCELLED_BOOKINGS = [
  {
    occurrenceId: 'rhyze-sep-2026-20260914-1915-tcj-hip-hop-happy-hour-tricia',
    email: 'careesonnett@gmail.com',
  },
] as const;

function knownCancelledOrClauses(): Prisma.BookingWhereInput[] {
  return KNOWN_CANCELLED_BOOKINGS.map((item) => ({
    occurrenceId: item.occurrenceId,
    user: { email: { equals: item.email, mode: 'insensitive' } },
  }));
}

export function confirmedRosterBookingWhere(): Prisma.BookingWhereInput {
  const overridden = knownCancelledOrClauses();
  return overridden.length
    ? { status: 'CONFIRMED', NOT: { OR: overridden } }
    : { status: 'CONFIRMED' };
}

export function instructorTaughtBookingWhere(): Prisma.BookingWhereInput {
  const overridden = knownCancelledOrClauses();
  const where: Prisma.BookingWhereInput = {
    status: { in: ['CONFIRMED', 'ATTENDED'] },
  };
  return overridden.length ? { ...where, NOT: { OR: overridden } } : where;
}
