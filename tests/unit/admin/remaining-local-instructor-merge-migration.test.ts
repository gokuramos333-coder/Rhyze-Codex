import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('remaining local instructor duplicate merge migration', () => {
  const sql = readFileSync(
    'netlify/database/migrations/20260826023000_merge_remaining_local_instructor_duplicates.sql',
    'utf8',
  );

  it('targets the remaining real-email instructor accounts instead of local placeholder profiles', () => {
    expect(sql).toContain('adrianna-jones@rhyze.local');
    expect(sql).toContain('a.altajones@gmail.com');
    expect(sql).toContain('mackenzie-heffernan@rhyze.local');
    expect(sql).toContain('kenzie41796@gmail.com');
    expect(sql).toContain('nicole-finley@rhyze.local');
    expect(sql).toContain('nicolesak303@gmail.com');
  });

  it('copies public profile fields, moves future classes, and archives local placeholders', () => {
    expect(sql).toContain('"bio" = COALESCE(NULLIF(target."bio", \'\'), source."bio")');
    expect(sql).toContain('"photoUrl" = COALESCE(target."photoUrl", source."photoUrl")');
    expect(sql).toContain('UPDATE "ClassOccurrence"');
    expect(sql).toContain('AND "startAt" >= CURRENT_TIMESTAMP');
    expect(sql).toContain('"isActive" = FALSE');
    expect(sql).toContain('"status" = \'ARCHIVED\'');
    expect(sql).toContain("'placeholderArchived', TRUE");
  });
});
