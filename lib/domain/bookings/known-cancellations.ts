import type { Prisma, PrismaClient } from '@prisma/client';

const KNOWN_CANCELLED_BOOKINGS = [
  {
    occurrenceId: 'rhyze-sep-2026-20260914-1915-tcj-hip-hop-happy-hour-tricia',
    email: 'careesonnett@gmail.com',
  },
] as const;

type Client = PrismaClient | Prisma.TransactionClient;

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

export async function reconcileKnownCancelledBookings(client: Client) {
  for (const item of KNOWN_CANCELLED_BOOKINGS) {
    const bookings = await client.booking.findMany({
      where: {
        occurrenceId: item.occurrenceId,
        status: 'CONFIRMED',
        user: { email: { equals: item.email, mode: 'insensitive' } },
      },
      select: { id: true },
    });
    if (!bookings.length) continue;
    const bookingIds = bookings.map((booking) => booking.id);
    await client.booking.updateMany({
      where: { id: { in: bookingIds } },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await client.attendanceRecord.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
  }
}
