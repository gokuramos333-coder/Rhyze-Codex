import type Stripe from 'stripe';

type CheckoutPurchase = {
  id: string;
  userId: string;
  stripeCheckoutSessionId: string | null;
  productKind: string;
};

export type MembershipCheckoutReturnGateway = {
  retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session>;
  findPurchase(purchaseId: string): Promise<CheckoutPurchase | null>;
  fulfillSession(session: Stripe.Checkout.Session): Promise<void>;
};

export type MembershipCheckoutReturnResult =
  | 'fulfilled'
  | 'pending'
  | 'invalid'
  | 'forbidden';

export async function fulfillMembershipCheckoutReturn(
  input: { sessionId: string; userId: string },
  gateway: MembershipCheckoutReturnGateway,
): Promise<MembershipCheckoutReturnResult> {
  const checkoutSession = await gateway.retrieveSession(input.sessionId);
  if (
    checkoutSession.payment_status !== 'paid' &&
    checkoutSession.payment_status !== 'no_payment_required'
  ) {
    return 'pending';
  }

  const purchaseId = checkoutSession.metadata?.purchaseId;
  if (!purchaseId) return 'invalid';

  const purchase = await gateway.findPurchase(purchaseId);
  if (
    !purchase ||
    purchase.productKind !== 'INTRO_TRIAL' ||
    purchase.stripeCheckoutSessionId !== checkoutSession.id
  ) {
    return 'invalid';
  }
  if (
    purchase.userId !== input.userId ||
    checkoutSession.metadata?.userId !== input.userId
  ) {
    return 'forbidden';
  }

  await gateway.fulfillSession(checkoutSession);
  return 'fulfilled';
}
