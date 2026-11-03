// Separate, dated owner grants do not assert a paid invoice or extend a subscription.
export const OWNER_UNLIMITED_PREFIX = 'owner-unlimited:';
export type OwnerUnlimitedAccount = {
  id?: string; label: string; validFrom?: Date; validUntil?: Date | null;
  sourcePurchaseId?: string | null; sourcePurchase?: unknown;
};
export function isOwnerUnlimitedAccess(account: OwnerUnlimitedAccount | null | undefined) {
  return Boolean(account?.id?.startsWith(OWNER_UNLIMITED_PREFIX) &&
    account.label.startsWith('Owner-granted unlimited standard classes') &&
    !account.sourcePurchaseId && !account.sourcePurchase);
}
export function ownerUnlimitedAccessAllows(account: OwnerUnlimitedAccount, now: Date, startsAt = now) {
  return isOwnerUnlimitedAccess(account) && Boolean(account.validFrom && account.validUntil &&
    now >= account.validFrom && now < account.validUntil &&
    startsAt >= account.validFrom && startsAt < account.validUntil);
}
export const ownerUnlimitedAccountsInclude = {
  where: { id: { startsWith: OWNER_UNLIMITED_PREFIX }, isUnlimited: true, sourcePurchaseId: null },
  select: { id: true, label: true, validFrom: true, validUntil: true, sourcePurchaseId: true },
} as const;
