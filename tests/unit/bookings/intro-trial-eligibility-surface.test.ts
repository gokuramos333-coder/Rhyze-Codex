import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('$7 intro trial checkout eligibility surface', () => {
  const membershipActions = readFileSync(
    'app/(portal)/member/membership/actions.ts',
    'utf8',
  );

  it('only blocks the intro trial for members who already used the intro trial', () => {
    const introTrialBlock = membershipActions.slice(
      membershipActions.indexOf("if (product.kind === 'INTRO_TRIAL')"),
      membershipActions.indexOf("if (!stripeIsConfigured()"),
    );

    expect(introTrialBlock).toContain('previousTrial');
    expect(introTrialBlock).not.toContain('previousBooking');
    expect(introTrialBlock).not.toContain('previousPurchase');
    expect(introTrialBlock).not.toContain('importedClient');
    expect(introTrialBlock).not.toContain('sombleClientProfile');
  });

  it('books against the first intro-trial class date when stale trials were never activated', () => {
    const bookingActions = readFileSync(
      'app/(portal)/member/bookings/actions.ts',
      'utf8',
    );

    expect(bookingActions).toContain('const firstTrialBooking = trial && !trial.activatedAt');
    expect(bookingActions).toContain("policySnapshot: { path: ['accessType'], equals: 'INTRO_TRIAL' }");
    expect(bookingActions).toContain('const trialActivationAt = trial?.activatedAt ?? firstTrialBooking?.occurrence.startAt ?? null');
    expect(bookingActions).toContain('activatedAt: trialActivationAt');
  });
});
