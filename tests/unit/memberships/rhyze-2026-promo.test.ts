import { describe, expect, it } from 'vitest';
import {
  RHYZE_2026_PROMO_CODE,
  RHYZE_2026_PROMO_DURATION_MONTHS,
  RHYZE_2026_PROMO_PERCENT_OFF,
  isRhyze2026PromoCode,
  isRhyze2026PromoEligibleProduct,
  isRhyze2026PromoWindow,
  membershipPromoCodeInputHelp,
  normalizeRhyzePromoCode,
  removeExpiredRhyze2026PromoCopy,
  rhyze2026PromoDiscountCents,
  shouldShowRhyze2026PromoCopy,
} from '@/lib/domain/memberships/rhyze-2026-promo';

const product = (overrides: Partial<Parameters<typeof isRhyze2026PromoEligibleProduct>[0]> = {}) => ({
  kind: 'MONTHLY_UNLIMITED' as const,
  billingInterval: 'MONTHLY' as const,
  priceCents: 22200,
  ...overrides,
});

describe('RHYZE2026 membership sale promo', () => {
  it('normalizes the customer-facing hashtag code', () => {
    expect(RHYZE_2026_PROMO_CODE).toBe('RHYZE2026');
    expect(normalizeRhyzePromoCode(' #rhyze2026 ')).toBe('RHYZE2026');
    expect(isRhyze2026PromoCode('#RHYZE2026')).toBe(true);
  });

  it('is redeemable only September 1 through September 7, 2026 in studio time', () => {
    expect(isRhyze2026PromoWindow(new Date('2026-09-01T03:59:59.999Z'))).toBe(false);
    expect(isRhyze2026PromoWindow(new Date('2026-09-01T04:00:00.000Z'))).toBe(true);
    expect(isRhyze2026PromoWindow(new Date('2026-09-08T03:59:59.999Z'))).toBe(true);
    expect(isRhyze2026PromoWindow(new Date('2026-09-08T04:00:00.000Z'))).toBe(false);
  });

  it('discounts paid recurring memberships by 20% for two months only', () => {
    expect(RHYZE_2026_PROMO_PERCENT_OFF).toBe(20);
    expect(RHYZE_2026_PROMO_DURATION_MONTHS).toBe(2);
    expect(isRhyze2026PromoEligibleProduct(product())).toBe(true);
    expect(rhyze2026PromoDiscountCents(product())).toBe(4440);
  });

  it('does not apply to class packs, drop-ins, events/one-time purchases, or the intro trial', () => {
    expect(isRhyze2026PromoEligibleProduct(product({ kind: 'CLASS_PACK' }))).toBe(false);
    expect(isRhyze2026PromoEligibleProduct(product({ kind: 'DROP_IN' }))).toBe(false);
    expect(isRhyze2026PromoEligibleProduct(product({ kind: 'INTRO_TRIAL' }))).toBe(false);
    expect(isRhyze2026PromoEligibleProduct(product({ billingInterval: 'ONE_TIME' }))).toBe(false);
  });

  it('removes customer-facing Labor Day sale copy after September 7', () => {
    const beforeEnd = new Date('2026-09-08T03:59:59.999Z');
    const afterEnd = new Date('2026-09-08T04:00:00.000Z');

    expect(shouldShowRhyze2026PromoCopy(beforeEnd)).toBe(true);
    expect(shouldShowRhyze2026PromoCopy(afterEnd)).toBe(false);
    expect(membershipPromoCodeInputHelp(beforeEnd)).toContain('OR use promo code: RHYZE2026');
    expect(membershipPromoCodeInputHelp(afterEnd)).toBe('(optional · instructor referrals still apply)');
    expect(removeExpiredRhyze2026PromoCopy(
      'VIP access. New membership buyers can use RHYZE2026 September 1–7 for 20% off the first 2 months.',
      afterEnd,
    )).toBe('VIP access.');
  });
});
