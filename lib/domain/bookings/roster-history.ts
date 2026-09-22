import type { Prisma } from '@prisma/client';
import { confirmedRosterBookingWhere } from './known-cancellations';

// Display history independently from the confirmed-only capacity query.
export function rosterHistoryBookingWhere(): Prisma.BookingWhereInput {
  return { OR: [confirmedRosterBookingWhere(), { status: { in: ['CANCELLED', 'LATE_CANCELLED', 'NO_SHOW', 'ATTENDED'] } }] };
}

export function rosterConfirmedBookings<T extends { status: string }>(bookings: T[]) {
  return bookings.filter(booking => booking.status === 'CONFIRMED');
}
