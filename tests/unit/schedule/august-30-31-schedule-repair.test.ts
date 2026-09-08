import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('August 30-31 2026 schedule repair migration', () => {
  const migration = readFileSync(
    'netlify/database/migrations/20260823170000_restore_august_30_31_schedule.sql',
    'utf8',
  );

  it('restores the missing public schedule classes for August 30 and August 31', () => {
    const repairSlots = [...migration.matchAll(
      /^\s*\('(2026-08-\d{2})', '(\d{2}:\d{2})', '([^']+)', '([^']+)'/gm,
    )].map((match) => `${match[1]} ${match[2]} ${match[3]} ${match[4]}`);

    expect(repairSlots).toEqual([
      '2026-08-30 09:00 yoga-vinyasa-mackenzie kenzie41796@gmail.com',
      '2026-08-31 10:00 pilates-pulse-adrianna a.altajones@gmail.com',
      '2026-08-31 11:00 yoga-flow-adrianna a.altajones@gmail.com',
      '2026-08-31 12:00 ignite-julie gritandgracefitnessnj@gmail.com',
      '2026-08-31 18:10 heels-101-walk-with-me-nicole nicolesak303@gmail.com',
    ]);
    expect(migration).toContain("'Vinyasa/Hatha Yoga'");
    expect(migration).toContain("'Kenzie'");
    expect(migration).toContain('restore-august-30-31-2026-schedule');
  });

  it('updates existing matching occurrences before inserting missing rows', () => {
    expect(migration).toContain('updated_existing AS (');
    expect(migration).toContain('"status" = \'SCHEDULED\'::"OccurrenceStatus"');
    expect(migration).toContain('WHERE NOT EXISTS (');
    expect(migration).toContain('ON CONFLICT ("id") DO UPDATE SET');
  });
});
