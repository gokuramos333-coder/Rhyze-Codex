export function importedBookingParty(policySnapshot: unknown): {
  guestNames: string[];
  seatCount: number;
  accessType: string | null;
} {
  if (!policySnapshot || typeof policySnapshot !== 'object') {
    return { guestNames: [], seatCount: 1, accessType: null };
  }

  const rawAccessType = (policySnapshot as { importedAccessType?: unknown })
    .importedAccessType;
  const accessType =
    typeof rawAccessType === 'string' && rawAccessType.trim()
      ? rawAccessType.trim()
      : null;

  return { guestNames: [], seatCount: 1, accessType };
}
