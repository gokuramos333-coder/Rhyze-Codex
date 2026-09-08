import type { ProductKind } from '@prisma/client';

export function referralDiscountCents(amountCents: number) {
  return Math.round(amountCents * 0.05);
}

export function isReferralEligibleProduct(kind: ProductKind) {
  return ['MONTHLY_UNLIMITED', 'LIMITED_MEMBERSHIP', 'VIP', 'DROP_IN'].includes(kind);
}

export function commissionCentsForProduct(kind: ProductKind) {
  if (kind === 'DROP_IN') return 500;
  return ['MONTHLY_UNLIMITED', 'LIMITED_MEMBERSHIP', 'VIP'].includes(kind)
    ? 2_000
    : 0;
}
