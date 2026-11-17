export type BoundOperation = {
  id: string;
  paymentIntentId: string;
  chargeId: string;
  amountCents: number;
  currency: string;
};
export type BoundReceipt = {
  id: string;
  operationId: string;
  paymentIntentId: string;
  chargeId: string;
  amountCents: number;
  currency: string;
  status: string;
};
export function verifyReceipt(
  operation: BoundOperation,
  receipt: BoundReceipt,
): boolean {
  return (
    !!receipt.id &&
    receipt.status === 'succeeded' &&
    receipt.operationId === operation.id &&
    receipt.paymentIntentId === operation.paymentIntentId &&
    receipt.chargeId === operation.chargeId &&
    receipt.amountCents === operation.amountCents &&
    receipt.currency === operation.currency
  );
}
export function replacementEligible(proof: {
  fullAttemptScan: boolean;
  originalCardAttached: boolean;
  originalFullyRefunded: boolean;
  consent: boolean;
  noShow: boolean;
  competingAttempt: boolean;
  lifetimeReplacement: boolean;
}): boolean {
  return (
    proof.fullAttemptScan &&
    proof.originalCardAttached &&
    proof.originalFullyRefunded &&
    proof.consent &&
    proof.noShow &&
    !proof.competingAttempt &&
    !proof.lifetimeReplacement
  );
}

export function refundSettlementMatches(
  proof: {
    paymentIntentId: string;
    originalAmountCents: number;
    refundedBeforeCents: number;
    amountCents: number;
    currency: string;
  },
  payment: {
    stripePaymentIntentId: string | null;
    amountCents: number;
    refundedAmountCents: number;
    currency: string;
  },
) {
  return (
    proof.paymentIntentId === payment.stripePaymentIntentId &&
    proof.currency === payment.currency &&
    Number.isSafeInteger(proof.originalAmountCents) &&
    Number.isSafeInteger(proof.refundedBeforeCents) &&
    proof.refundedBeforeCents >= 0 &&
    proof.amountCents > 0 &&
    proof.refundedBeforeCents + proof.amountCents ===
      proof.originalAmountCents &&
    payment.amountCents === proof.originalAmountCents &&
    payment.refundedAmountCents >= proof.refundedBeforeCents &&
    payment.refundedAmountCents <= payment.amountCents
  );
}
