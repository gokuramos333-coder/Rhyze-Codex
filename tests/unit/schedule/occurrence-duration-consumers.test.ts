import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as management from '@/lib/domain/schedule/occurrence-management';

describe('stored occurrence duration', () => {
  it('uses the actual interval, not a global template default', () => {
    expect((management as any).occurrenceDurationMinutes({ startAt: new Date('2026-11-01T15:00Z'), endAt: new Date('2026-11-01T15:50Z'), template: { durationMinutes: 30 } })).toBe(50);
  });
  it.each([
    'app/book/[slug]/page.tsx', 'app/(portal)/member/page.tsx',
    'app/(portal)/member/bookings/page.tsx', 'app/(studio)/admin/classes/page.tsx',
    'app/(portal)/member/bookings/actions.ts', 'app/(studio)/admin/schedule/[occurrenceId]/roster/actions.ts',
    'components/sections/EventsPreview.tsx', 'app/(studio)/admin/events/page.tsx',
    'lib/domain/schedule/public-schedule-query.ts', 'app/events/[slug]/page.tsx', 'app/book/event/[slug]/page.tsx',
  ])('wires occurrence duration into %s', path => {
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('occurrenceDurationMinutes(');
    expect(source).not.toMatch(/occurrence\??\.template.durationMinutes/);
  });
});
