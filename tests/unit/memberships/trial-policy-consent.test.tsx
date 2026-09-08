import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TrialPolicyConsent } from '@/components/memberships/TrialPolicyConsent';
import {
  parseTrialPolicyConsent,
  TRIAL_POLICY_VERSION,
} from '@/lib/domain/memberships/trial-policy-consent';

describe('intro-trial attendance policy consent', () => {
  it('rejects checkout without an explicit trial-policy acknowledgement', () => {
    expect(() => parseTrialPolicyConsent(null)).toThrow(
      'Accept the intro-trial cancellation and no-show policy to continue.',
    );
  });

  it('builds an immutable fee and coverage snapshot for the purchase', () => {
    const acceptedAt = new Date('2026-08-21T15:00:00.000Z');

    expect(parseTrialPolicyConsent('on', acceptedAt)).toEqual({
      policyAcceptedAt: acceptedAt,
      policyAcceptance: {
        version: TRIAL_POLICY_VERSION,
        productKind: 'INTRO_TRIAL',
        standardClassesOnly: true,
        trialDays: 7,
        lateCancellationWindowMinutes: 120,
        lateCancellationFeeCents: 1_000,
        noShowFeeCents: 1_000,
        savedPaymentMethodConsent: true,
      },
    });
  });

  it('renders a required checkbox with the exact $10 attendance terms', () => {
    const html = renderToStaticMarkup(<TrialPolicyConsent />);

    expect(html).toContain('name="trialPolicyAccepted"');
    expect(html).toContain('required=""');
    expect(html).toContain('$10 late-cancellation fee');
    expect(html).toContain('$10 no-show fee');
    expect(html).toContain('saved payment method');
    expect(html).toContain('/policies#waiver');
    expect(html).toContain('/policies#cancellation');
  });
});
