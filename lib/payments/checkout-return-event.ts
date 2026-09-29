import type Stripe from 'stripe';

/** A Checkout session's creation time is not its payment time. */
export async function checkoutReturnEvent(stripe: Stripe, session: Stripe.Checkout.Session, now = new Date()): Promise<Stripe.Event> {
  let paidAt: number;
  if (session.status !== 'complete') throw new Error('Checkout is not complete.');
  if (session.payment_status === 'no_payment_required' && session.amount_total === 0) {
    paidAt = Math.floor(now.getTime() / 1000);
  } else {
    const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!intentId || session.payment_status !== 'paid') throw new Error('Checkout has no verified payment.');
    const intent = await stripe.paymentIntents.retrieve(intentId);
    const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id;
    if (intent.status !== 'succeeded' || intent.livemode !== session.livemode || !chargeId) throw new Error('Checkout payment has not succeeded.');
    const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
    const chargeIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (chargeIntentId !== intentId || charge.livemode !== session.livemode || !charge.paid || !charge.captured || charge.disputed || charge.amount_refunded > 0 || charge.currency !== session.currency || charge.amount_captured !== session.amount_total) throw new Error('Checkout charge cannot fulfill this purchase.');
    const balance = typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
    paidAt = balance?.created ?? charge.created;
    if (!Number.isSafeInteger(paidAt) || paidAt <= 0) throw new Error('Checkout payment time is unavailable.');
  }
  return { id: `checkout-return-${session.id}`, type: 'checkout.session.completed', livemode: session.livemode, created: paidAt, data: { object: session } } as Stripe.Event;
}
