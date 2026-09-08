type PaymentHistoryPurchase = {
  status: string;
  stripePaymentIntentId?: string | null;
};

/**
 * Checkout drafts are created before a customer reaches Stripe. A PENDING row
 * is only a submitted payment when Stripe has attached a Payment Intent.
 */
export function isVisiblePaymentHistoryPurchase(
  purchase: PaymentHistoryPurchase,
) {
  return (
    purchase.status !== 'PENDING' ||
    Boolean(purchase.stripePaymentIntentId)
  );
}
