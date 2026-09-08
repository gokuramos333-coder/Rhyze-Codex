import { EVENT_CREDIT_LABEL_PREFIX } from '@/lib/domain/bookings/booking-rules';

export const VIP_MONTHLY_EVENT_CREDIT_POLICY =
  'VIP monthly event credit; no rollover; excludes Tricia Johnsen specialty events';

export type VipMonthlyBenefitWindow = {
  key: string;
  monthLabel: string;
  validFrom: Date;
  validUntil: Date;
  expirationLabel: string;
  classCreditLabel: string;
  eventCreditLabel: string;
  eventGrantReason: string;
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function vipMonthlyBenefitWindow(input: { year: number; monthIndex: number }): VipMonthlyBenefitWindow {
  const { year, monthIndex } = input;
  const validFrom = new Date(Date.UTC(year, monthIndex, 1, 4, 0, 0, 0));
  const validUntil = new Date(Date.UTC(year, monthIndex + 1, 1, 4, 0, 0, 0));
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0, 4, 0, 0, 0)).getUTCDate();
  const monthNumber = monthIndex + 1;
  const monthLabel = `${MONTH_NAMES[monthIndex]} ${year}`;
  const expirationLabel = `${year}-${pad(monthNumber)}-${pad(lastDay)}`;
  return {
    key: `${year}-${pad(monthNumber)}`,
    monthLabel,
    validFrom,
    validUntil,
    expirationLabel,
    classCreditLabel: `VIP membership — unlimited standard class credits — ${monthLabel}`,
    eventCreditLabel: `${EVENT_CREDIT_LABEL_PREFIX} — ${monthLabel} VIP complimentary event credit — expires ${expirationLabel}`,
    eventGrantReason: `Manual admin credit grant: ${monthLabel} VIP complimentary event credit — no rollover; excludes Tricia Johnsen specialty events`,
  };
}

export function vipMonthlyBenefitWindowForDate(now: Date) {
  return vipMonthlyBenefitWindow({ year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() });
}

export function vipMonthlyBenefitWindowForNextMonth(now: Date) {
  return vipMonthlyBenefitWindow({ year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() + 1 });
}
