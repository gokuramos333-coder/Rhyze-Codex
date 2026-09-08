import { describe, expect, it } from 'vitest';
import { attendanceToggle } from '@/lib/domain/bookings/attendance-toggle';

describe('instructor attendance toggles', () => {
  it('sets a new attendance status', () => {
    expect(attendanceToggle(null, 'CHECKED_IN')).toEqual({
      action: 'SET',
      attendanceStatus: 'CHECKED_IN',
      bookingStatus: 'CONFIRMED',
    });
  });

  it('undoes the currently selected status', () => {
    expect(attendanceToggle('NO_SHOW', 'NO_SHOW')).toEqual({
      action: 'CLEAR',
      attendanceStatus: null,
      bookingStatus: 'CONFIRMED',
    });
  });

  it('treats check in as the final positive attendance control', () => {
    expect(attendanceToggle('LATE_CANCELLED', 'CHECKED_IN')).toEqual({
      action: 'SET',
      attendanceStatus: 'CHECKED_IN',
      bookingStatus: 'CONFIRMED',
    });
  });
});
