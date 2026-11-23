import type { AttendanceStatus, BookingStatus } from '@prisma/client';
import { specialEventIdentity } from '@/lib/payments/black-friday-new-friend';
import { paidEventDisplayCount, type SpecialEventRoster } from '@/lib/payments/special-event-roster';

/** Display counts only. Checkout and waitlist eligibility use reservation-aware capacity. */
export async function paidEventDisplayCounts(occurrenceIds: Iterable<string>) {
  const ids = [...new Set(occurrenceIds)].filter((id) => specialEventIdentity(id));
  const counts = await Promise.all(ids.map(async (id) => [id, await paidEventDisplayCount(id)] as const));
  return new Map(counts);
}

export function paidEventCalendarAttendance(
  occurrence: {
    historicalSignupCount: number;
    bookings: { id: string; status: BookingStatus; attendance: { status: AttendanceStatus } | null }[];
  },
  roster: SpecialEventRoster,
) {
  // The paid groups cover linked attendees and guests without bookings.
  const excluded = new Set(roster.linkedBookingIds);
  const bookingStatuses = new Map(occurrence.bookings.map(({ id, status }) => [id, status]));
  const independent = occurrence.bookings.filter((booking) =>
    !excluded.has(booking.id) && (booking.status === 'CONFIRMED' || booking.status === 'ATTENDED'));
  const attendance = [
    ...independent.map((booking) => booking.attendance?.status ?? booking.status),
    ...roster.groups.flatMap((group) => group.attendees.map((attendee) =>
      attendee.attendanceStatus ??
      (attendee.bookingId ? bookingStatuses.get(attendee.bookingId) : undefined) ??
      'CONFIRMED')),
  ];
  return {
    attended: attendance.filter((status) => status === 'CHECKED_IN' || status === 'ATTENDED').length,
    attendanceUnmarked: occurrence.historicalSignupCount + attendance.filter((status) => status === 'CONFIRMED').length,
  };
}
