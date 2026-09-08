export type AttendanceValue =
  | 'CHECKED_IN'
  | 'ATTENDED'
  | 'NO_SHOW'
  | 'LATE_CANCELLED';

export function selectNextWaitlistEntry<
  T extends { status: string; joinedAt: Date },
>(entries: T[]): T | undefined {
  return entries
    .filter((entry) => entry.status === 'WAITING')
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
}

export function bookingStatusForAttendance(status: AttendanceValue) {
  if (status === 'ATTENDED') return 'ATTENDED' as const;
  if (status === 'NO_SHOW') return 'NO_SHOW' as const;
  if (status === 'LATE_CANCELLED') return 'LATE_CANCELLED' as const;
  return 'CONFIRMED' as const;
}

export function cancellationOutcome(
  startAt: Date,
  cancelledAt: Date,
  cutoffMinutes: number,
) {
  const cutoffAt = startAt.getTime() - cutoffMinutes * 60_000;
  const late = cancelledAt.getTime() > cutoffAt;
  return {
    status: late ? ('LATE_CANCELLED' as const) : ('CANCELLED' as const),
    restoreCredit: !late,
  };
}
