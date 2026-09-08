import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('intro trial opening date migration', () => {
  it('moves the $7 intro trial availability to July 30, 2026', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20260730180000_intro_trial_available_now/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain(
      '"availabilityStart" = TIMESTAMP \'2026-07-30 04:00:00\'',
    );
    expect(migration).toContain('"kind" = \'INTRO_TRIAL\'');
    expect(migration).toContain('"priceCents" = 700');
  });
});
