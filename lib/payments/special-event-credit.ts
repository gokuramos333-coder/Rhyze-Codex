import type { Booking, Prisma } from '@prisma/client';
import { assertFinancialRelease } from './financial-release';
import { GIFT_CREDIT_PREFIX } from '@/lib/domain/credits/gift-credit';
import { vipMonthlyBenefitWindowForDate } from '@/lib/domain/credits/vip-monthly-benefits';
import { specialEventCreditAllowed, specialEventOfferMatches } from './black-friday-new-friend';

type EarnedCredit = {
  id: string;
  isUnlimited: boolean;
  label: string;
  sourcePurchaseId: string | null;
  validFrom: Date;
  validUntil: Date | null;
  entries: ReadonlyArray<{ quantity: number }>;
};

function earnedEventCreditTermsCover(account: EarnedCredit, now: Date, eventStart: Date): boolean {
  return !account.id.startsWith(GIFT_CREDIT_PREFIX) && account.sourcePurchaseId === null &&
    specialEventCreditAllowed(account) &&
    account.label === vipMonthlyBenefitWindowForDate(eventStart).eventCreditLabel &&
    account.validFrom <= now && account.validFrom <= eventStart &&
    account.validUntil !== null && now < account.validUntil && eventStart < account.validUntil;
}

/** Both a native single and the eligible split pair spend the earned event-month benefit. */
export function earnedEventCreditCovers(account: EarnedCredit, now: Date, eventStart: Date): boolean {
  return earnedEventCreditTermsCover(account, now, eventStart) &&
    account.entries.reduce((balance, entry) => balance + entry.quantity, 0) > 0;
}

export async function authorizeNativeEventAdmission(
  tx: Prisma.TransactionClient, occurrenceId: string, userId: string, creditAccountId: string,
) {
  await assertFinancialRelease(tx);
  await tx.$queryRaw`SELECT set_config('rhyze.native_event_admission',
    jsonb_build_array(${occurrenceId}::text,${userId}::text,${creditAccountId}::text)::text,true)`;
}

// An absence correction keeps the original reservation. A second debit would
// charge a member twice, including when their original debit exhausted the account.
export async function authorizeNativeEventAttendanceCorrection(
  tx: Prisma.TransactionClient,
  booking: Booking,
  occurrence: Parameters<typeof specialEventOfferMatches>[0] & { status: string; capacity: number; historicalSignupCount: number },
) {
  const snapshot = booking.policySnapshot;
  const creditId = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot.creditAccountId : null;
  if (typeof creditId !== 'string' || !specialEventOfferMatches(occurrence)) throw Error('The original event credit requires review.');
  await assertFinancialRelease(tx);
  const capacity = await tx.$queryRaw<{used: number}[]>`SELECT used FROM "BlackFridayCapacity" WHERE "occurrenceId"=${occurrence.id}`;
  if (occurrence.status !== 'SCHEDULED' || !capacity[0] || capacity[0].used + occurrence.historicalSignupCount >= occurrence.capacity) {
    throw Error('Event seats unavailable');
  }
  const account = await tx.creditAccount.findFirst({ where: { id: creditId, userId: booking.userId }, include: { entries: { select: { quantity: true } } } });
  const entries = await tx.creditLedgerEntry.findMany({ where: { bookingId: booking.id }, select: { creditAccountId: true, type: true, quantity: true } });
  if (!account || !hasRetainedEventReservation(account, booking.bookedAt, occurrence.startAt, entries)) {
    throw Error('The original event credit requires review.');
  }
  const refund = await tx.commerceRefund.findFirst({ where: { bookingId: booking.id, status: { in: ['PENDING','SUCCEEDED'] } }, select: { id: true } });
  const reversed = await tx.paymentRecord.findFirst({ where: { bookingId: booking.id, kind: 'EVENT', OR: [
    { refundedAmountCents: { gt: 0 } }, { status: { in: ['REFUNDED','PARTIALLY_REFUNDED','DISPUTED'] } },
  ] }, select: { id: true } });
  if (refund || reversed) throw Error('This booking has a cash refund or disputed admission.');
  await tx.$queryRaw`SELECT set_config('rhyze.native_event_attendance_correction',
    jsonb_build_array(${booking.id}::text,${occurrence.id}::text,${booking.userId}::text,${creditId}::text,${booking.status}::text)::text,true)`;
}

export function hasRetainedEventReservation(
  account: EarnedCredit, bookedAt: Date, eventStart: Date,
  entries: ReadonlyArray<{creditAccountId: string; type: string; quantity: number}>,
): boolean {
  if (!earnedEventCreditTermsCover(account, bookedAt, eventStart) ||
      account.entries.reduce((sum, entry) => sum + entry.quantity, 0) < 0) return false;
  const balances = new Map<string, number>();
  for (const entry of entries) {
    if (!(entry.type === 'RESERVE' && entry.quantity === -1) && !(entry.type === 'RELEASE' && entry.quantity === 1)) return false;
    balances.set(entry.creditAccountId, (balances.get(entry.creditAccountId) ?? 0) + entry.quantity);
  }
  return balances.get(account.id) === -1 && [...balances].every(([id, balance]) => id === account.id || balance === 0);
}
