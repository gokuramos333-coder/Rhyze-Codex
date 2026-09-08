import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('classes page calendar', () => {
  const source = readFileSync('app/classes/page.tsx', 'utf8');
  const hero = readFileSync('components/sections/Hero.tsx', 'utf8');

  it('embeds the same live daily, weekly, and monthly calendar as home', () => {
    expect(source).toContain(
      "import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar'",
    );
    expect(source).toContain(
      "import { loadPublicScheduleSlots } from '@/lib/domain/schedule/public-schedule-query'",
    );
    expect(source).toContain('<WeeklyCalendar slots={slots}');
    expect(source).toContain('id="schedule"');
    expect(source).toContain('scroll-mt-44');
  });

  it('routes the home schedule CTA to the embedded Classes calendar', () => {
    expect(hero).toContain('href="/classes#schedule"');
  });
});
