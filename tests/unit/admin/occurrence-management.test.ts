import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  occurrenceInstructorName,
  occurrenceLocalInputValue,
  occurrenceLocalTimeZone,
  occurrenceTitle,
  parseOccurrenceLocalStart,
} from '@/lib/domain/schedule/occurrence-management';

describe('admin occurrence management', () => {
  it('parses admin datetime-local values as studio local time instead of UTC', () => {
    expect(parseOccurrenceLocalStart('2026-08-14T12:00').toISOString()).toBe(
      '2026-08-14T16:00:00.000Z',
    );
    expect(parseOccurrenceLocalStart('2026-01-14T12:00').toISOString()).toBe(
      '2026-01-14T17:00:00.000Z',
    );
  });

  it('renders stored occurrence instants in the New Jersey studio timezone', () => {
    const hypnoticHeels = new Date('2026-08-10T22:45:00.000Z');

    expect(occurrenceLocalTimeZone()).toBe('America/New_York');
    expect(occurrenceLocalInputValue(hypnoticHeels)).toBe('2026-08-10T18:45');
  });

  it('lets a single occurrence override its public class title and instructor display', () => {
    const occurrence = {
      titleOverride: 'Ignite Express',
      substituteInstructorName: 'Guest Teacher',
      instructor: { name: 'Julie' },
      template: { name: 'Ignite' },
    };

    expect(occurrenceTitle(occurrence)).toBe('Ignite Express');
    expect(occurrenceInstructorName(occurrence)).toBe('Guest Teacher');
  });

  it('wires the admin manage form to save occurrence title, substitute instructor, and Sub label controls', () => {
    const page = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/page.tsx', 'utf8');
    const actions = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/actions.ts', 'utf8');
    const schema = readFileSync('prisma/schema.prisma', 'utf8');

    expect(page).toContain('name="titleOverride"');
    expect(page).toContain('name="substituteInstructorName"');
    expect(page).toContain('name="isSubstitute"');
    expect(actions).toContain('titleOverride: cleanOptionalText(formData.get(\'titleOverride\'))');
    expect(actions).toContain('substituteInstructorName: cleanOptionalText(formData.get(\'substituteInstructorName\'))');
    expect(actions).toContain('isSubstitute: formData.get(\'isSubstitute\') === \'on\'');
    expect(schema).toContain('titleOverride');
    expect(schema).toContain('substituteInstructorName');
    expect(schema).toContain('isSubstitute');
  });

  it('shows public substitute classes with a small red Sub box next to the instructor name', () => {
    const query = readFileSync('lib/domain/schedule/public-schedule-query.ts', 'utf8');
    const calendar = readFileSync('components/sections/WeeklyCalendar.tsx', 'utf8');
    const detail = readFileSync('app/schedule/[occurrenceId]/page.tsx', 'utf8');

    expect(query).toContain('isSubstitute: occurrence.isSubstitute');
    expect(query).toContain('occurrenceInstructorName(occurrence)');
    expect(calendar).toContain('slot.isSubstitute');
    expect(calendar).toContain('SUB');
    expect(calendar).toContain('bg-rhyze-coral');
    expect(detail).toContain('occurrence.isSubstitute');
    expect(detail).toContain('SUB');
  });

  it('keeps every instructor class surface on the shared studio-time formatter', () => {
    const pages = [
      'app/(portal)/instructor/schedule/page.tsx',
      'app/(portal)/instructor/classes/[occurrenceId]/message/page.tsx',
      'app/(portal)/instructor/classes/[occurrenceId]/roster/page.tsx',
      'app/(portal)/instructor/classes/[occurrenceId]/transfers/page.tsx',
    ];

    for (const page of pages) {
      const source = readFileSync(page, 'utf8');
      expect(source).toContain('memberBookingDateTimeLabel');
      expect(source).not.toContain('startAt.toLocaleString()');
    }
  });

  it('does not force public occurrence labels into UTC', () => {
    const query = readFileSync(
      'lib/domain/schedule/public-schedule-query.ts',
      'utf8',
    );

    expect(query).toContain('timeZone: timezone');
    expect(query).not.toContain("timeZone: 'UTC'");
  });
});
