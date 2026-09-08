import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEPTEMBER_2026_SCHEDULE } from '@/lib/domain/schedule/september-2026-schedule';

describe('September 2026 production migration', () => {
  const migration = readFileSync(
    'netlify/database/migrations/20260821090000_september_2026_schedule.sql',
    'utf8',
  );

  it('publishes every approved date, time, and template as a normal class occurrence', () => {
    const migratedSlots = [...migration.matchAll(
      /^\s*\('(2026-09-\d{2})', '(\d{2}:\d{2})', '([^']+)'/gm,
    )].map((match) => `${match[1]} ${match[2]} ${match[3]}`);
    const approvedSlots = SEPTEMBER_2026_SCHEDULE.map(
      (slot) => `${slot.date} ${slot.time} ${slot.templateSlug}`,
    );

    expect(migratedSlots).toHaveLength(81);
    expect(migratedSlots).toEqual(approvedSlots);
    expect(migration).toContain('INSERT INTO "ClassOccurrence"');
    expect(migration).toContain("'SCHEDULED'::\"OccurrenceStatus\"");
  });

  it('protects related records and creates the new editable templates', () => {
    expect(migration).toContain('Refusing to replace September classes with related records');
    expect(migration).toContain("'work-tone-mswoy36a'");
    expect(migration).toContain("'mommy-and-me-dennisse'");
    expect(migration).toContain("'NEW!'::text");
    expect(migration).toContain("'preview-september-2026-schedule'");
  });
});
