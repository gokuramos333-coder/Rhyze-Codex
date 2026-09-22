type CreditProduct = {
  kind: string;
  includedCredits?: number | null;
  customPlanType?: string | null;
};
type Source = {
  product: CreditProduct;
  membership?: { product?: CreditProduct } | null;
};

/** Current eligibility only. Do not use this to relabel receipts or old booking policies. */
export function currentCreditProduct(
  account: { sourcePurchase?: Source | null } | null | undefined,
) {
  return (
    account?.sourcePurchase?.membership?.product ??
    account?.sourcePurchase?.product ??
    null
  );
}
