import type { BillingInterval, ProductKind } from '@prisma/client';

export const RHYZE_2026_PROMO_CODE = 'RHYZE2026';
export const RHYZE_2026_PROMO_PERCENT_OFF = 20;
export const RHYZE_2026_PROMO_DURATION_MONTHS = 2;
export const RHYZE_2026_PROMO_START = new Date('2026-09-01T04:00:00.000Z');
export const RHYZE_2026_PROMO_END = new Date('2026-09-08T04:00:00.000Z');

export type RhyzePromoProduct = {
  kind: ProductKind;
  billingInterval: BillingInterval;
  priceCents: number;
};

export function normalizeRhyzePromoCode(input: string | null | undefined) {
  return (input || '').trim().replace(/^#+/, '').toUpperCase();
}

export function isRhyze2026PromoCode(input: string | null | undefined) {
  return normalizeRhyzePromoCode(input) === RHYZE_2026_PROMO_CODE;
}

export function isRhyze2026PromoWindow(now = new Date()) {
  return now >= RHYZE_2026_PROMO_START && now < RHYZE_2026_PROMO_END;
}

export function shouldShowRhyze2026PromoCopy(now = new Date()) {
  return now < RHYZE_2026_PROMO_END;
}

export function membershipPromoCodeInputHelp(now = new Date()) {
  return shouldShowRhyze2026PromoCopy(now)
    ? '(optional · instructor referrals still apply, OR use promo code: RHYZE2026 gives new membership buyers 20% off the first 2 months during Sept 1–7 only; no class packs, trials, events, or single classes)'
    : '(optional · instructor referrals still apply)';
}

export function removeExpiredRhyze2026PromoCopy(text: string, now = new Date()) {
  if (shouldShowRhyze2026PromoCopy(now)) return text;
  return text
    .replace(/\s*New membership buyers can use RHYZE2026 September 1–7 for 20% off the first 2 months\./g, '')
    .replace(/\s*RHYZE2026 sale: 20% off the first 2 months for new membership buyers only\.?/g, '')
    .replace(/\s*RHYZE2026 eligible for new membership buyers\.?/g, '')
    .replace(/\s*RHYZE2026 gives 20% off first 2 months only for eligible new membership buyers\.?/g, '')
    .replace(/\s*RHYZE2026 does not apply to class packs\.?/g, '')
    .trim();
}

export function isRhyze2026PromoEligibleProduct(product: RhyzePromoProduct) {
  return (
    product.priceCents > 0 &&
    product.billingInterval !== 'ONE_TIME' &&
    product.kind !== 'INTRO_TRIAL' &&
    product.kind !== 'CLASS_PACK' &&
    product.kind !== 'DROP_IN'
  );
}

export function rhyze2026PromoDiscountCents(product: RhyzePromoProduct) {
  return isRhyze2026PromoEligibleProduct(product)
    ? Math.round(product.priceCents * (RHYZE_2026_PROMO_PERCENT_OFF / 100))
    : 0;
}
