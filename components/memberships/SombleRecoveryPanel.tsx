import React from 'react';
import type { Recovery } from '@/lib/domain/memberships/somble-billing-recovery';
export function SombleRecoveryPanel({
  recovery: r,
  action,
}: {
  recovery: Recovery;
  action: (form: FormData) => Promise<void>;
}) {
  const amount = `$${r.amountCents / 100}`;
  const ordinal = r.day === 3 ? '3rd' : '4th';
  return (
    <section
      id="billing-recovery"
      className="mt-8 border-t-4 border-rhyze-coral bg-white p-6"
    >
      <h2 className="font-display text-4xl tracking-wider">
        Reconnect your membership billing
      </h2>
      <p className="mt-4">
        Your automatic billing did not carry over from Somble. Your August
        payment is recorded and will not be charged again.
      </p>
      <p className="mt-3 font-bold">
        {amount} due now for September {r.day}–October {r.day}, 2026.
      </p>
      <p className="mt-3">
        {r.name}: {amount} monthly on the {ordinal}, beginning October {r.day},
        2026.{' '}
        {r.kind === 'VIP'
          ? 'Your unlimited standard classes and existing monthly event benefit stay connected.'
          : 'Your allowance is eight standard classes per monthly period, less any classes already paid for by this allowance.'}
      </p>
      <p className="mt-3 text-sm">
        Stripe may describe the delay until October as a trial. September is
        paid membership recovery, not a free or new seven-day trial. Your
        existing account and history remain connected. Credits are reconciled
        only after payment succeeds.
      </p>
      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="membershipId" value={r.membershipId} />
        <label className="flex items-start gap-3 text-sm font-bold">
          <input
            type="checkbox"
            name="recurringConsent"
            required
            className="mt-1"
          />
          <span>
            I authorize the {amount} September payment and future {r.name}{' '}
            renewals of {amount} on the {ordinal} of each month, beginning
            October {r.day}, 2026.
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="retryExpired" className="mt-1" />
          <span>
            If my previous unpaid checkout has expired, create a replacement
            secure checkout.
          </span>
        </label>
        <button
          type="submit"
          className="bg-rhyze-black px-6 py-3 text-sm font-black text-white"
        >
          Continue to secure Stripe checkout
        </button>
      </form>
    </section>
  );
}
