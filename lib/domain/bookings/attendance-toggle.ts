import type { AttendanceStatus, BookingStatus } from '@prisma/client';
import { bookingStatusForAttendance } from './booking-rules';

export type InstructorAttendanceStatus = Extract<
  AttendanceStatus,
  'CHECKED_IN' | 'NO_SHOW' | 'LATE_CANCELLED'
>;

export function attendanceToggle(
  currentStatus: AttendanceStatus | null,
  requestedStatus: InstructorAttendanceStatus,
): {
  action: 'SET' | 'CLEAR';
  attendanceStatus: InstructorAttendanceStatus | null;
  bookingStatus: BookingStatus;
} {
  if (currentStatus === requestedStatus) {
    return {
      action: 'CLEAR',
      attendanceStatus: null,
      bookingStatus: 'CONFIRMED',
    };
  }

  return {
    action: 'SET',
    attendanceStatus: requestedStatus,
    bookingStatus: bookingStatusForAttendance(requestedStatus),
  };
}
