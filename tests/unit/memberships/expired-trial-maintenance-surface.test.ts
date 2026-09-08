import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('expired intro-trial maintenance', () => {
  it('runs daily and backfills missing trial windows from first intro-trial class bookings', () => {
    const maintenance = readFileSync('netlify/functions/daily-maintenance.ts', 'utf8');
    const route = readFileSync('app/api/jobs/memberships/route.ts', 'utf8');

    expect(maintenance).toContain("runProtectedJob('/api/jobs/memberships')");
    expect(route).toContain('backfilledTrialWindows');
    expect(route).toContain("booking.\"policySnapshot\"->>'accessType' = 'INTRO_TRIAL'");
    expect(route).toContain("first_trial_class.\"firstClassAt\" + INTERVAL '7 days'");
    expect(route).toContain("product.kind = 'INTRO_TRIAL'");
    expect(route).toContain('expiredTrialCredits');
    expect(route).toContain("status: { in: ['TRIALING', 'ACTIVE'] }");
    expect(route).toContain("data: { status: 'EXPIRED' }");
  });
});
