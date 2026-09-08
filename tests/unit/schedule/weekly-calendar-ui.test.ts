import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('public weekly calendar controls', () => {
  const source = readFileSync(
    'components/sections/WeeklyCalendar.tsx',
    'utf8',
  );

  it('shows all seven selectable dates above the daily schedule', () => {
    expect(source).toContain('data-week-date={day.dateKey}');
    expect(source).toContain('weekDays.map((day)');
    expect(source).toContain('{day.day}');
    expect(source).toContain('{day.dateLabel}');
  });

  it('moves daily and weekly views one full week at a time', () => {
    expect(source).toContain("view === 'monthly' ? 'Previous month' : 'Previous week'");
    expect(source).toContain("view === 'monthly' ? 'Next month' : 'Next week'");
  });

  it('uses condensed schedule titles, orange class types, and concise book actions', () => {
    expect(source).toContain(
      "compact ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl'",
    );
    expect(source).toContain('{slot.category}');
    expect(source).toContain('text-rhyze-orange');
    expect(source).toContain('uppercase');
    expect(source).toContain("{full ? 'JOIN WAITLIST' : 'BOOK'}");
    expect(source).toContain('WAITLIST FULL');
    expect(source).toContain(
      "compact ? 'grid-cols-1 p-3 md:grid-cols-[3.5rem_minmax(0,1fr)_auto]'",
    );
    expect(source).toContain(
      "compact ? 'w-full px-3 py-3 text-[0.7rem] md:w-auto md:py-2'",
    );
    expect(source).not.toContain('Details /');
    expect(source).not.toContain('!compact && (\\n        <Link');
  });

  it('labels specialty events and omits redundant room and in-person copy', () => {
    expect(source).toContain('slot.isEvent');
    expect(source).toContain('SPECIAL EVENT');
    expect(source).not.toContain('In-Person');
    expect(source).not.toContain('slot.room');
  });
});
