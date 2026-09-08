import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  config,
  runMembershipMaintenance,
} from '@/netlify/functions/membership-maintenance';

describe('dedicated membership maintenance function', () => {
  it('runs the membership reconciliation job independently every hour', async () => {
    const runJob = vi.fn().mockResolvedValue({ expiredTrials: 3 });

    await expect(runMembershipMaintenance(runJob)).resolves.toEqual({
      expiredTrials: 3,
    });
    expect(runJob).toHaveBeenCalledOnce();
    expect(runJob).toHaveBeenCalledWith('/api/jobs/memberships');
    expect(config.schedule).toBe('15 * * * *');
  });

  it('immediately reconciles already-expired intro trials without deleting history', () => {
    const sql = readFileSync(
      'netlify/database/migrations/20260826181000_reconcile_expired_intro_trials.sql',
      'utf8',
    );

    expect(sql).toContain("product.\"kind\" = 'INTRO_TRIAL'");
    expect(sql).toContain("membership.\"status\" IN ('TRIALING', 'ACTIVE')");
    expect(sql).toContain('membership.\"currentPeriodEnd\" <= CURRENT_TIMESTAMP');
    expect(sql).toContain('\"status\" = \'EXPIRED\'');
    expect(sql).toContain('\"validUntil\" = expired_intro.\"currentPeriodEnd\"');
    expect(sql).toContain('memberships.expired-intro-trials-reconciled');
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"(?:Membership|Purchase|CreditAccount)"/i);
  });
});
