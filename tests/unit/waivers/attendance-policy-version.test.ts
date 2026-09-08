import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('attendance policy agreement version', () => {
  const migration = readFileSync(
    'prisma/migrations/20260821133000_attendance_policy_waiver_version/migration.sql',
    'utf8',
  );

  it('creates a required new active agreement with the complete fee matrix', () => {
    expect(migration).toContain('UPDATE "WaiverVersion" SET "isActive" = false');
    expect(migration).toContain("'rhyze-agreement-attendance-2026-08-21'");
    expect(migration).toContain('$5 transfer fee');
    expect(migration).toContain('VIP clients may reschedule within 14 days with no transfer fee');
    expect(migration).toContain('$10 late-cancellation fee');
    expect(migration).toContain('$10 for standard clients');
    expect(migration).toContain('$10 for intro-trial clients');
    expect(migration).toContain('$10 for VIP clients');
    expect(migration).toContain('saved payment method');
    expect(migration).toContain('true,\n  true,');
    expect(migration).not.toContain('VIP Access transfer fees are waived');
  });
});
