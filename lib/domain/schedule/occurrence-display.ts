export type OccurrenceDateTimeInput = {
  startAt: Date;
  timezone?: string | null;
};

const DEFAULT_STUDIO_TIMEZONE = 'America/New_York';

export function occurrenceTimezone(timezone?: string | null) {
  return timezone || DEFAULT_STUDIO_TIMEZONE;
}

export function memberBookingDateTimeLabel({
  startAt,
  timezone,
}: OccurrenceDateTimeInput) {
  return startAt.toLocaleString('en-US', {
    timeZone: occurrenceTimezone(timezone),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function occurrenceAdminDateTimeLabel(input: OccurrenceDateTimeInput) {
  return memberBookingDateTimeLabel(input);
}
