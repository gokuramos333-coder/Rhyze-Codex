import type { ProductKind } from '@prisma/client';

export function referralDiscountCents(amountCents: number) {
  return Math.round(amountCents * 0.05);
}

export function commissionCentsForProduct(kind: ProductKind) {
  return ['MONTHLY_UNLIMITED', 'LIMITED_MEMBERSHIP', 'VIP'].includes(kind)
    ? 2_000
    : 500;
}
