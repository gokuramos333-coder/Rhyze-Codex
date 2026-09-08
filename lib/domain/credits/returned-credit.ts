export const RETURNED_CREDIT_VALIDITY_DAYS = 14;

export function returnedCreditTerms(returnedAt = new Date()) {
  return {
    validFrom: returnedAt,
    validUntil: new Date(
      returnedAt.getTime() + RETURNED_CREDIT_VALIDITY_DAYS * 24 * 60 * 60 * 1_000,
    ),
    quantity: 1,
  } as const;
}

export function returnedCreditTransactionKey(
  source: 'RHYZE' | 'SOMBLE',
  transactionId: string,
) {
  return `returned-credit:${source}:${transactionId}`;
}
