const TAUGHT_CLASS_SLUG = 'grind-and-grow-carla-reo';
const TAUGHT_CLASS_START = '2026-08-05T22:00:00.000Z';

type CarlaOccurrence = {
  id: string;
  templateSlug: string;
  startAt: Date;
  confirmedBookings: number;
};

export function planCarlaInstructorHistoryCleanup(
  occurrences: CarlaOccurrence[],
) {
  const taught = occurrences.filter(
    (occurrence) =>
      occurrence.templateSlug === TAUGHT_CLASS_SLUG &&
      occurrence.startAt.toISOString() === TAUGHT_CLASS_START &&
      occurrence.confirmedBookings === 1,
  );
  if (taught.length !== 1) {
    throw new Error('Carla history cleanup expected exactly one taught class');
  }

  return {
    keptOccurrenceId: taught[0].id,
    detachedOccurrenceIds: occurrences
      .filter((occurrence) => occurrence.id !== taught[0].id)
      .map((occurrence) => occurrence.id),
  };
}
