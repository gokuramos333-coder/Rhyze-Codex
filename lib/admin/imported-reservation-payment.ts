type ImportedReservationPaymentInput = {
  isEvent: boolean;
  accessType: string | null;
  priceCents: number | null;
};

export function importedReservationPayment({
  isEvent,
  accessType,
  priceCents,
}: ImportedReservationPaymentInput) {
  if (isEvent && accessType === 'purchased' && priceCents && priceCents > 0) {
    return { label: 'Event purchase', amountCents: priceCents };
  }

  return { label: 'Membership credit used', amountCents: null };
}
