import { EVENT_CREDIT_LABEL_PREFIX } from '@/lib/domain/bookings/booking-rules';

export type ManualCreditKind = 'CLASS' | 'EVENT';

export function manualCreditLabel(
  kind: ManualCreditKind,
  expirationDate: string,
) {
  const prefix = kind === 'EVENT' ? EVENT_CREDIT_LABEL_PREFIX : 'Class credit';
  return `${prefix} — Manual admin grant — expires ${expirationDate}`;
}

export function manualCreditKindForLabel(label: string): ManualCreditKind {
  return label.startsWith(EVENT_CREDIT_LABEL_PREFIX) ? 'EVENT' : 'CLASS';
}

type ManualCreditDeletionInput = {
  isUnlimited: boolean;
  sourcePurchaseId: string | null;
  entries: Array<{
    type: string;
    quantity: number;
    bookingId: string | null;
    reason: string | null;
  }>;
};

export function manualCreditAccountCanBeDeleted(
  account: ManualCreditDeletionInput,
) {
  const isManualGrant = account.entries.some(
    (entry) =>
      entry.type === 'GRANT' &&
      entry.reason?.startsWith('Manual admin credit grant:'),
  );
  const hasBookingHistory = account.entries.some((entry) => entry.bookingId);
  return (
    !account.isUnlimited &&
    !account.sourcePurchaseId &&
    isManualGrant &&
    !hasBookingHistory
  );
}
