export const GIFT_CREDIT_PREFIX = 'gift-credit:';
export const GIFT_REASON_PREFIX = 'Gift credit grant: ';
export type GiftCreditKind = 'CLASS' | 'EVENT' | 'BOTH';
export const giftKindLabels: Record<GiftCreditKind, string> = {
  CLASS: 'Class only',
  EVENT: 'Event only',
  BOTH: 'Class or event',
};
export type GiftAccount = {
  id?: string;
  label: string;
  validFrom?: Date;
  validUntil?: Date | null;
  sourcePurchaseId?: string | null;
  sourcePurchase?: unknown;
  isUnlimited?: boolean;
};
export function giftCreditKind(
  account: Pick<GiftAccount, 'id'>,
): GiftCreditKind | null {
  const kind = account.id?.startsWith(GIFT_CREDIT_PREFIX)
    ? account.id.split(':')[1]
    : null;
  return kind === 'CLASS' || kind === 'EVENT' || kind === 'BOTH' ? kind : null;
}
export function giftCreditAllows(
  account: GiftAccount,
  now: Date,
  startsAt: Date,
  isEvent: boolean,
) {
  if (!account.id?.startsWith(GIFT_CREDIT_PREFIX)) return true;
  const kind = giftCreditKind(account);
  return Boolean(
    kind &&
    !account.isUnlimited &&
    !account.sourcePurchaseId &&
    !account.sourcePurchase &&
    account.validFrom &&
    account.validUntil &&
    now >= account.validFrom &&
    now < account.validUntil &&
    startsAt >= account.validFrom &&
    startsAt < account.validUntil &&
    (kind === 'BOTH' || (isEvent ? kind === 'EVENT' : kind === 'CLASS')),
  );
}
export function giftCreditReason(
  entries: { type: string; reason: string | null }[],
) {
  return (
    entries
      .find(
        (e) => e.type === 'GRANT' && e.reason?.startsWith(GIFT_REASON_PREFIX),
      )
      ?.reason?.slice(GIFT_REASON_PREFIX.length) || 'Studio gift'
  );
}
export function giftMonthEnd(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
