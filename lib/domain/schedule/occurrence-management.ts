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
