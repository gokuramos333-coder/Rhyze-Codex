import { resolveAnalyticsRange } from '@/lib/admin/analytics-range';

type InstructorOccurrence = {
  startAt: Date;
  status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
  isSubstitute: boolean;
  substituteInstructorName: string | null;
  attendeeCount: number;
};

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isTaughtByInstructor(
  occurrence: InstructorOccurrence,
  instructorName: string,
) {
  if (!occurrence.isSubstitute) return true;
  const substituteName = normalizedName(
    occurrence.substituteInstructorName || '',
  );
  const fullName = normalizedName(instructorName);
  const firstName = normalizedName(instructorName.trim().split(/\s+/)[0] || '');
  return Boolean(
    substituteName &&
      (substituteName === fullName || substituteName === firstName),
  );
}

export function instructorClassStats(input: {
  now: Date;
  instructorName: string;
  occurrences: InstructorOccurrence[];
}) {
  const month = resolveAnalyticsRange({ range: 'month' }, input.now);
  const assignedToInstructor = input.occurrences.filter((occurrence) =>
    isTaughtByInstructor(occurrence, input.instructorName),
  );
  const pastTaught = assignedToInstructor.filter(
    (occurrence) =>
      occurrence.startAt < input.now &&
      occurrence.status !== 'CANCELLED' &&
      occurrence.attendeeCount > 0,
  );
  const upcoming = assignedToInstructor.filter(
    (occurrence) =>
      occurrence.startAt >= input.now && occurrence.status === 'SCHEDULED',
  );

  return {
    taughtThisMonth: pastTaught.filter(
      (occurrence) =>
        occurrence.startAt >= month.start && occurrence.startAt <= month.end,
    ).length,
    pastTaught: pastTaught.length,
    upcoming: upcoming.length,
  };
}
