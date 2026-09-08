type SomblePaymentIdentity = {
  paymentId: string;
};

type StripeSyncedPaymentIdentity = {
  stripeEventId: string;
  stripePaymentIntentId?: string | null;
};

const STRIPE_SYNC_CHARGE_PREFIX = 'stripe-sync-charge-';

export function chargeIdFromSyncedPaymentRecord(record: StripeSyncedPaymentIdentity) {
  return record.stripeEventId.startsWith(STRIPE_SYNC_CHARGE_PREFIX)
    ? record.stripeEventId.slice(STRIPE_SYNC_CHARGE_PREFIX.length)
    : null;
}

export function somblePaymentIdSet(transactions: SomblePaymentIdentity[]) {
  return new Set(transactions.map((transaction) => transaction.paymentId).filter(Boolean));
}

export function isSombleBackedStripePaymentRecord(
  record: StripeSyncedPaymentIdentity,
  somblePaymentIds: Set<string>,
) {
  const chargeId = chargeIdFromSyncedPaymentRecord(record);
  return Boolean(
    (chargeId && somblePaymentIds.has(chargeId)) ||
      (record.stripePaymentIntentId && somblePaymentIds.has(record.stripePaymentIntentId)),
  );
}

export function excludeSombleBackedStripePaymentRecords<T extends StripeSyncedPaymentIdentity>(
  records: T[],
  transactions: SomblePaymentIdentity[],
) {
  const paymentIds = somblePaymentIdSet(transactions);
  return records.filter((record) => !isSombleBackedStripePaymentRecord(record, paymentIds));
}
