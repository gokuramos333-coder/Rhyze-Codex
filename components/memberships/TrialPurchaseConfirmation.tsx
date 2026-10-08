import React from 'react';
import { TRIAL_POLICY_TITLE, TRIAL_POLICY_TEXT } from '@/lib/domain/memberships/trial-policy-consent';

export function TrialPurchaseConfirmation() {
  return (
    <section aria-label="Trial purchase confirmation" className="mt-6 border-t-4 border-rhyze-gold bg-white p-6">
      <h2 className="font-display text-3xl tracking-wide">PURCHASE CONFIRMED — YOUR TRIAL IS ACTIVE</h2>
      <div className="mt-4 border border-rhyze-orange/40 bg-orange-50 p-4">
        <h3 className="font-bold text-rhyze-black">{TRIAL_POLICY_TITLE}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-rhyze-black/80">{TRIAL_POLICY_TEXT}</p>
      </div>
    </section>
  );
}
