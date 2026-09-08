import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('expired intro trial and Rachel instructor merge migration', () => {
  const sql = readFileSync(
    'netlify/database/migrations/20260826013000_expired_trials_and_rachel_instructor_merge.sql',
    'utf8',
  );

  it('expires stale intro-trial memberships and syncs unlimited trial credit expiration', () => {
    expect(sql).toContain("product.\"kind\" = 'INTRO_TRIAL'");
    expect(sql).toContain("membership.\"currentPeriodEnd\" <= CURRENT_TIMESTAMP");
    expect(sql).toContain('UPDATE "CreditAccount" AS account');
    expect(sql).toContain('"validUntil" = expired_intro."currentPeriodEnd"');
    expect(sql).toContain('SET "status" = \'EXPIRED\'');
  });

  it('merges Rachel Crowe onto the real-email instructor account and moves future classes', () => {
    expect(sql).toContain("LOWER(\"email\") = 'rachel@rhyze.local'");
    expect(sql).toContain("LOWER(\"email\") = 'rrose973@yahoo.com'");
    expect(sql).toContain('"photoUrl" = COALESCE(target."photoUrl", source."photoUrl")');
    expect(sql).toContain('WHERE "instructorId" = placeholder_rachel_id');
    expect(sql).toContain('AND "startAt" >= CURRENT_TIMESTAMP');
    expect(sql).toContain("'placeholderArchived', TRUE");
  });
});
