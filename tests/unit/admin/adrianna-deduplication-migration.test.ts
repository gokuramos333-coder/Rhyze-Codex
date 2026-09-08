import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Adrianna instructor deduplication', () => {
  it('merges the legacy first-name-only seed account into Adrianna Jones', () => {
    const migration = readFileSync(
      'prisma/migrations/20260724141000_deduplicate_adrianna_instructor/migration.sql',
      'utf8',
    );

    expect(migration).toContain("'adrianna@rhyze.local'");
    expect(migration).toContain("'adrianna-jones@rhyze.local'");
    expect(migration).toContain('DELETE FROM "User"');
  });

  it('does not recreate the first-name-only account when seeding', () => {
    const seed = readFileSync('prisma/seed.ts', 'utf8');

    expect(seed).not.toContain("where: { email: 'adrianna@rhyze.local' }");
    expect(seed).toContain("name: 'Adrianna Jones'");
  });
});
