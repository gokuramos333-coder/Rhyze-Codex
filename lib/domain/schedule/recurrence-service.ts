type WeeklyRecurrenceInput = {
  startLocal: string;
  timezone: string;
  intervalWeeks: number;
  count: number;
};

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseLocalDateTime(value: string): LocalDateTime {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) throw new Error('Use a local ISO date and time.');

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };
}

function partsInTimeZone(date: Date, timezone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function asUtcMilliseconds(value: LocalDateTime): number {
  return Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
  );
}

function zonedLocalToUtc(local: LocalDateTime, timezone: string): Date {
  const target = asUtcMilliseconds(local);
  let candidate = target;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = partsInTimeZone(new Date(candidate), timezone);
    candidate += target - asUtcMilliseconds(rendered);
  }

  return new Date(candidate);
}

export function expandWeeklyRecurrence({
  startLocal,
  timezone,
  intervalWeeks,
  count,
}: WeeklyRecurrenceInput): Date[] {
  if (intervalWeeks < 1 || count < 1) {
    throw new Error('Recurrence interval and count must be positive.');
  }

  const start = parseLocalDateTime(startLocal);
  return Array.from({ length: count }, (_, index) => {
    const localDate = new Date(
      Date.UTC(
        start.year,
        start.month - 1,
        start.day + index * intervalWeeks * 7,
        start.hour,
        start.minute,
        start.second,
      ),
    );

    return zonedLocalToUtc(
      {
        year: localDate.getUTCFullYear(),
        month: localDate.getUTCMonth() + 1,
        day: localDate.getUTCDate(),
        hour: localDate.getUTCHours(),
        minute: localDate.getUTCMinutes(),
        second: localDate.getUTCSeconds(),
      },
      timezone,
    );
  });
}
