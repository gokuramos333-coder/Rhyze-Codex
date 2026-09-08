import { EVENT_CREDIT_LABEL_PREFIX } from '@/lib/domain/bookings/booking-rules';

type AvailableCreditAccount = {
  label: string;
  available: number;
  isUnlimited?: boolean;
};

export type AvailableCreditSummary = {
  classCredits: number;
  eventCredits: number;
  hasUnlimitedClassAccess: boolean;
};

export function availableCreditSummary(
  accounts: AvailableCreditAccount[],
): AvailableCreditSummary {
  return accounts.reduce<AvailableCreditSummary>(
    (totals, account) => {
      const eventCredit = account.label.startsWith(EVENT_CREDIT_LABEL_PREFIX);
      const available = Math.max(0, account.available);
      if (eventCredit) {
        totals.eventCredits += available;
      } else {
        totals.classCredits += available;
        totals.hasUnlimitedClassAccess ||= account.isUnlimited === true;
      }
      return totals;
    },
    { classCredits: 0, eventCredits: 0, hasUnlimitedClassAccess: false },
  );
}

export function classCreditDisplayLabel(
  summary: AvailableCreditSummary,
  membershipKind?: string | null,
) {
  if (!summary.hasUnlimitedClassAccess) return String(summary.classCredits);
  if (membershipKind === 'VIP') return 'UNLIMITED WITH VIP MEMBERSHIP STATUS';
  if (membershipKind === 'INTRO_TRIAL') return 'UNLIMITED ACCESS / 7 DAY TRIAL';
  return 'UNLIMITED STANDARD CLASS ACCESS';
}

export function separatedAvailableCreditBalances(
  accounts: AvailableCreditAccount[],
) {
  const { classCredits, eventCredits } = availableCreditSummary(accounts);
  return { classCredits, eventCredits };
}
