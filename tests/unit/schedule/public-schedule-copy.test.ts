import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('public schedule copy', () => {
  it('removes room labels from public class booking and legacy schedule pages', () => {
    const bookingSource = readFileSync('app/book/[slug]/page.tsx', 'utf8');
    const scheduleSource = readFileSync('app/schedule/page.tsx', 'utf8');
    const detailSource = readFileSync(
      'app/schedule/[occurrenceId]/page.tsx',
      'utf8',
    );

    expect(bookingSource).not.toContain('occurrence.room');
    expect(bookingSource).not.toContain('matchingSlot.room');
    expect(scheduleSource).not.toContain('occurrence.room');
    expect(scheduleSource).not.toContain('see the room');
    expect(detailSource).not.toContain('occurrence.room');
    expect(detailSource).not.toContain('label="Location"');
  });

  it('carries the event flag into shared Home and Classes schedule cards', () => {
    const querySource = readFileSync(
      'lib/domain/schedule/public-schedule-query.ts',
      'utf8',
    );
    const calendarSource = readFileSync(
      'lib/domain/schedule/public-calendar.ts',
      'utf8',
    );

    expect(calendarSource).toContain('isEvent: boolean');
    expect(querySource).toContain('isEvent: occurrence.template.isEvent');
  });
});
