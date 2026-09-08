import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('standalone public schedule', () => {
  const pageSource = readFileSync('app/schedule/page.tsx', 'utf8');
  const querySource = readFileSync(
    'lib/domain/schedule/public-schedule-query.ts',
    'utf8',
  );

  it('uses the same branded calendar as Home and Classes', () => {
    expect(pageSource).toContain(
      "import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar'",
    );
    expect(pageSource).toContain('<WeeklyCalendar');
    expect(pageSource).toContain('slots={slots}');
    expect(pageSource).toContain('initialDateKey={searchParams.date}');
    expect(pageSource).toContain("searchParams.view === 'weekly' || searchParams.view === 'monthly'");
    expect(pageSource).not.toContain('occurrences.map');
    expect(pageSource).not.toContain('Details / Book');
  });

  it('loads filters from assigned upcoming classes instead of account roles', () => {
    expect(pageSource).toContain('loadPublicScheduleFilterOptions');
    expect(querySource).toContain(
      'export async function loadPublicScheduleFilterOptions',
    );
    expect(querySource).not.toContain("role: 'INSTRUCTOR'");
    expect(pageSource).toContain('name="class"');
  });
});
