import { zonedLocalDateTimeToDate } from './recurrence-service';

const studioTimezone = 'America/New_York';

type OccurrenceTitleSource = {
  titleOverride?: string | null;
  template: { name: string };
};

type OccurrenceInstructorSource = {
  substituteInstructorName?: string | null;
  instructor?: { name: string | null } | null;
};

export function parseOccurrenceLocalStart(
  value: string,
  timezone = studioTimezone,
): Date {
  return zonedLocalDateTimeToDate(value, timezone);
}

export function occurrenceLocalTimeZone() {
  return studioTimezone;
}

export function occurrenceLocalInputValue(date: Date) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: occurrenceLocalTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return formatter.format(date).replace(' ', 'T');
}

export function cleanOptionalText(value: FormDataEntryValue | null) {
  const cleaned = String(value || '').trim();
  return cleaned || null;
}

/** Persisted dates are authoritative for occurrence overrides and access rules. */
export function occurrenceDurationMinutes(occurrence: { startAt: Date; endAt: Date }) {
  return (occurrence.endAt.getTime() - occurrence.startAt.getTime()) / 60_000;
}

export function occurrenceTitle(occurrence: OccurrenceTitleSource) {
  return occurrence.titleOverride?.trim() || occurrence.template.name;
}

export function occurrenceTitleWithInstructor(
  title: string,
  instructorName: string,
) {
  const cleanedTitle = title.trim();
  if (/\bwith\b/i.test(cleanedTitle)) return cleanedTitle;

  const cleanedInstructor = instructorName.trim() || 'Instructor TBA';
  const displayInstructor = /^instructor\s+tba$/i.test(cleanedInstructor)
    ? 'Instructor TBA'
    : cleanedInstructor.split(/\s+/)[0];
  return `${cleanedTitle} with ${displayInstructor}`;
}

export function occurrenceInstructorName(occurrence: OccurrenceInstructorSource) {
  return (
    occurrence.substituteInstructorName?.trim() ||
    occurrence.instructor?.name ||
    'Instructor TBA'
  );
}

/** Use the same occurrence title and assigned instructor as the public calendar. */
export function instructorOccurrenceTitle(occurrence: OccurrenceTitleSource & OccurrenceInstructorSource) {
  // Templates may retain their original teacher in the format name. Only an
  // explicit date override may preserve a title's own instructor wording.
  const title = occurrence.titleOverride?.trim()
    || occurrence.template.name.replace(/\s+with\s+.+$/i, '').trim();
  return occurrenceTitleWithInstructor(title, occurrenceInstructorName(occurrence));
}
