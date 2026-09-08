import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('RHYZE2026 checkout guard surface', () => {
  const actions = readFileSync('app/(portal)/member/membership/actions.ts', 'utf8');
  const page = readFileSync('app/(portal)/member/membership/page.tsx', 'utf8');

  it('normalizes hashtag promo code before referral lookup', () => {
    expect(actions).toContain('normalizeRhyzePromoCode');
    expect(actions).toContain('isRhyze2026PromoCode(referralCodeInput)');
    expect(actions.indexOf('isRhyze2026PromoCode')).toBeLessThan(
      actions.indexOf('prisma.referralCode.findFirst'),
    );
  });

  it('blocks current members and ineligible products before creating Stripe checkout', () => {
    expect(actions).toContain('isRhyze2026PromoWindow()');
    expect(actions).toContain('isRhyze2026PromoEligibleProduct(product)');
    expect(actions).toContain('customer?.memberships?.length');
    expect(actions.indexOf('customer?.memberships?.length')).toBeLessThan(
      actions.indexOf('stripe.checkout.sessions.create'),
    );
  });

  it('blocks any second promo code before referral lookup or Stripe checkout', () => {
    expect(actions).toContain('previousDiscountedPurchase');
    expect(actions).toContain('discountCents: { gt: 0 }');
    expect(actions).toContain("status: { in: ['PAID', 'PARTIALLY_REFUNDED'] }");
    expect(actions.indexOf('previousDiscountedPurchase')).toBeLessThan(
      actions.indexOf('prisma.referralCode.findFirst'),
    );
    expect(actions.indexOf('previousDiscountedPurchase')).toBeLessThan(
      actions.indexOf('stripe.checkout.sessions.create'),
    );
  });

  it('creates a Stripe-compatible repeating two-month percent coupon', () => {
    expect(actions).toContain('percent_off: RHYZE_2026_PROMO_PERCENT_OFF');
    expect(actions).toContain("duration: 'repeating'");
    expect(actions).toContain('duration_in_months: RHYZE_2026_PROMO_DURATION_MONTHS');
    expect(actions).toContain("name: 'RHYZE2026 20% off 2 months'");
    expect(actions).not.toContain('RHYZE2026 — 20% off first 2 membership months');
    expect('RHYZE2026 20% off 2 months'.length).toBeLessThanOrEqual(40);
    expect(page).toContain('membershipPromoCodeInputHelp(now)');
    expect(page).not.toContain('including $5 instructor commission on drop-ins; RHYZE2026');
  });
});
