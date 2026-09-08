function safeOccurrenceId(occurrenceId: string) {
  return encodeURIComponent(occurrenceId);
}

export function instructorRosterHref(occurrenceId: string) {
  return `/instructor/classes/${safeOccurrenceId(occurrenceId)}/roster`;
}

export function adminRosterHref(occurrenceId: string) {
  return `/admin/schedule/${safeOccurrenceId(occurrenceId)}/roster`;
}
