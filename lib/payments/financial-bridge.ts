import type Stripe from 'stripe';
const transitionEvents = new Set([
  'cmw026ajl0001jn09jsqpqzij',
  'cmvv9bp4g0001gt09ewtk8n57',
]);
export function assertLegacyEventAdmission(occurrenceId: string) {
  if (transitionEvents.has(occurrenceId))
    throw Error(
      'This event checkout is temporarily paused while the new ticket options are verified. Please try again shortly.',
    );
}
/** Temporary compatibility bridge. No flag can enable these writes in this artifact. */
export function closeLegacyFinancialWriters(stripe: Stripe): Stripe {
  const paused = () => {
    throw Error(
      'Cash refunds and attendance fees are temporarily paused for the verified refund-approval release. No financial request was submitted.',
    );
  };
  stripe.refunds.create = paused;
  stripe.paymentIntents.create = paused;
  const createCheckout = stripe.checkout.sessions.create.bind(
    stripe.checkout.sessions,
  );
  stripe.checkout.sessions.create = ((
    ...args: Parameters<typeof createCheckout>
  ) => {
    assertLegacyEventAdmission(
      String(
        (args[0] as Stripe.Checkout.SessionCreateParams)?.metadata
          ?.occurrenceId || '',
      ),
    );
    return createCheckout(...args);
  }) as typeof createCheckout;
  return stripe;
}
