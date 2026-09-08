import { EVENT_CREDIT_LABEL_PREFIX } from './booking-rules';

export const EVENT_CANCELLATION_CUTOFF_MINUTES = 6 * 60;
export const EVENT_CREDIT_VALIDITY_DAYS = 30;

export type CancellationCreditDecision =
  | 'NONE'
  | 'RELEASE_RESERVATION'
  | 'CREATE_EVENT_CREDIT';

export function cancellationCreditDecision(input: {
  isEvent: boolean;
  restoreCredit: boolean;
  hasReservation: boolean;
}): CancellationCreditDecision {
  if (!input.restoreCredit) return 'NONE';
  if (input.hasReservation) return 'RELEASE_RESERVATION';
  return input.isEvent ? 'CREATE_EVENT_CREDIT' : 'NONE';
}

export function eventCancellationCreditLabel(className: string) {
  return `${EVENT_CREDIT_LABEL_PREFIX} — ${className}`;
}

export function eventCancellationCreditKey(bookingId: string) {
  return `event-cancellation:${bookingId}`;
}

export function eventCancellationCreditTerms(cancelledAt = new Date()) {
  return {
    validFrom: cancelledAt,
    validUntil: new Date(
      cancelledAt.getTime() + EVENT_CREDIT_VALIDITY_DAYS * 24 * 60 * 60 * 1_000,
    ),
    quantity: 1,
  } as const;
}
