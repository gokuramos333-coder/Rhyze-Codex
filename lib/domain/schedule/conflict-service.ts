type TimeRange = { startAt: Date; endAt: Date };

export function hasScheduleConflict(
  existing: TimeRange,
  candidate: TimeRange,
): boolean {
  return (
    candidate.startAt.getTime() < existing.endAt.getTime() &&
    candidate.endAt.getTime() > existing.startAt.getTime()
  );
}
