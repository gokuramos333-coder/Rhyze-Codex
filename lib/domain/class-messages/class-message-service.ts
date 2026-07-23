export function canManageOccurrence(
  instructorId: string,
  occurrenceInstructorId: string | null,
) {
  return occurrenceInstructorId === instructorId;
}

export function confirmedRecipientIds(
  bookings: Array<{ userId: string; status: string }>,
) {
  return [...new Set(bookings.filter((item) => item.status === 'CONFIRMED').map((item) => item.userId))];
}
