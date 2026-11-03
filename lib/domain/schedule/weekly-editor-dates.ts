/** Finite wall-clock dates; the server validates each in America/New_York. */
export function weeklyEditorDates(start: string, through: string): string[] {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(through)
  )
    throw Error('Choose a first date/time and an end date.');
  const day = start.slice(0, 10),
    time = start.slice(11);
  const first = new Date(day + 'T12:00:00Z'),
    last = new Date(through + 'T12:00:00Z');
  if (
    !Number.isFinite(+first) ||
    !Number.isFinite(+last) ||
    first.toISOString().slice(0, 10) !== day ||
    last.toISOString().slice(0, 10) !== through ||
    +last < +first ||
    +last - +first > 366 * 86400000
  )
    throw Error('Choose an end date within one year of the first class.');
  const result = [];
  for (let at = +first; at <= +last; at += 7 * 86400000)
    result.push(new Date(at).toISOString().slice(0, 10) + 'T' + time);
  return result;
}
