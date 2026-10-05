import { zonedLocalDateTimeToDate } from '@/lib/domain/schedule/recurrence-service';
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

export function vipMonthlyBenefitWindow(input: {
  year: number;
  monthIndex: number;
}): VipMonthlyBenefitWindow {
  const normalized = new Date(Date.UTC(input.year, input.monthIndex, 1));
  const year = normalized.getUTCFullYear();
  const monthIndex = normalized.getUTCMonth();
  const next = new Date(Date.UTC(year, monthIndex + 1, 1));
  const validFrom = zonedLocalDateTimeToDate(
    `${year}-${pad(monthIndex + 1)}-01T00:00`,
    'America/New_York',
  );
  const validUntil = zonedLocalDateTimeToDate(
    `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-01T00:00`,
    'America/New_York',
  );
  const lastDay = new Date(
    Date.UTC(year, monthIndex + 1, 0, 4, 0, 0, 0),
  ).getUTCDate();
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

function studioMonth(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  return {
    year: Number(parts.find((p) => p.type === 'year')!.value),
    monthIndex: Number(parts.find((p) => p.type === 'month')!.value) - 1,
  };
}

export function vipMonthlyBenefitWindowForDate(now: Date) {
  return vipMonthlyBenefitWindow(studioMonth(now));
}

export function vipMonthlyBenefitWindowForNextMonth(now: Date) {
  const month = studioMonth(now);
  return vipMonthlyBenefitWindow({
    ...month,
    monthIndex: month.monthIndex + 1,
  });
}
