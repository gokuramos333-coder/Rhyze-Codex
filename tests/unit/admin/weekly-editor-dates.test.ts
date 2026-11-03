import { describe, it, expect } from 'vitest';
import { weeklyEditorDates } from '@/lib/domain/schedule/weekly-editor-dates';
describe('finite monthly weekly schedule', () => {
  it('preserves the local clock across DST and includes only dates through the explicit end', () => {
    expect(weeklyEditorDates('2026-10-25T09:00', '2026-11-15')).toEqual([
      '2026-10-25T09:00',
      '2026-11-01T09:00',
      '2026-11-08T09:00',
      '2026-11-15T09:00',
    ]);
  });
  it('rejects reversed, invalid or unbounded repeat windows', () => {
    for (const end of ['2026-10-01', '2027-02-30', '2028-01-01', ''])
      expect(() => weeklyEditorDates('2026-11-03T19:10', end)).toThrow();
  });
});
