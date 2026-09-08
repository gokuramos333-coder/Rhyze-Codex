import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('inactive local instructor assignment merge migration', () => {
  const sql = readFileSync(
    'netlify/database/migrations/20260826024500_merge_inactive_local_instructor_assignments.sql',
    'utf8',
  );

  it('moves hidden future class assignments from local placeholders to real instructor accounts', () => {
    expect(sql).toContain('julie-reese@rhyze.local');
    expect(sql).toContain('gritandgracefitnessnj@gmail.com');
    expect(sql).toContain('tricia-johnsen@rhyze.local');
    expect(sql).toContain('tcjdancefit@gmail.com');
    expect(sql).toContain('UPDATE "ClassOccurrence"');
    expect(sql).toContain('AND "startAt" >= CURRENT_TIMESTAMP');
  });

  it('keeps real profiles active and archives the local placeholder accounts', () => {
    expect(sql).toContain('"isActive" = TRUE');
    expect(sql).toContain('"role" = \'INSTRUCTOR\'');
    expect(sql).toContain('"isActive" = FALSE');
    expect(sql).toContain('"status" = \'ARCHIVED\'');
    expect(sql).toContain("'placeholderArchived', TRUE");
  });
});
