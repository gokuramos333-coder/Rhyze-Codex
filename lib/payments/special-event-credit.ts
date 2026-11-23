import type { Prisma } from '@prisma/client';
import { assertFinancialRelease } from './financial-release';
import { GIFT_CREDIT_PREFIX } from '@/lib/domain/credits/gift-credit';
import { vipMonthlyBenefitWindowForDate } from '@/lib/domain/credits/vip-monthly-benefits';
import { specialEventCreditAllowed } from './black-friday-new-friend';

type EarnedCredit = {
  id: string;
  isUnlimited: boolean;
  label: string;
  sourcePurchaseId: string | null;
  validFrom: Date;
  validUntil: Date | null;
  entries: ReadonlyArray<{ quantity: number }>;
};

/** Both a native single and the eligible split pair spend the earned event-month benefit. */
export function earnedEventCreditCovers(account: EarnedCredit, now: Date, eventStart: Date): boolean {
  return !account.id.startsWith(GIFT_CREDIT_PREFIX) && account.sourcePurchaseId === null &&
    specialEventCreditAllowed(account) &&
    account.label === vipMonthlyBenefitWindowForDate(eventStart).eventCreditLabel &&
    account.validFrom <= now && account.validFrom <= eventStart &&
    account.validUntil !== null && now < account.validUntil && eventStart < account.validUntil &&
    account.entries.reduce((balance, entry) => balance + entry.quantity, 0) > 0;
}

export async function authorizeNativeEventAdmission(
  tx: Prisma.TransactionClient, occurrenceId: string, userId: string, creditAccountId: string,
) {
  await assertFinancialRelease(tx);
  await tx.$queryRaw`SELECT set_config('rhyze.native_event_admission',
    jsonb_build_array(${occurrenceId}::text,${userId}::text,${creditAccountId}::text)::text,true)`;
}
