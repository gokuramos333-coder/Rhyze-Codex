type ProtectedHistoryCounts = {
  bookings: number;
  waitlistEntries: number;
  attendanceRecords: number;
  classMessages: number;
  commerceOrders: number;
};

type ClassTemplateOccurrenceHistory = {
  _count: ProtectedHistoryCounts;
};

export function classTemplateHasProtectedHistory(
  occurrences: ClassTemplateOccurrenceHistory[],
) {
  return occurrences.some(({ _count }) =>
    [
      _count.bookings,
      _count.waitlistEntries,
      _count.attendanceRecords,
      _count.classMessages,
      _count.commerceOrders,
    ].some((count) => count > 0),
  );
}
