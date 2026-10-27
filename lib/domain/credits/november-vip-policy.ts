/** Owner-approved exception applies to event dates in November 2026, studio time. */
export function isNovember2026EventDate(date?: Date | null) {
  return Boolean(date && date >= new Date('2026-11-01T04:00:00.000Z') && date < new Date('2026-12-01T05:00:00.000Z'));
}

export function vipEventAccessCopy(date?: Date | null) {
  return isNovember2026EventDate(date)
    ? 'For November 2026, VIP members may use one valid monthly event credit for ANY event, including Tricia. Credits expire at month end; no rollover.'
    : 'VIP members receive 1 eligible specialty event per month when this event is included in the monthly selection.';
}
