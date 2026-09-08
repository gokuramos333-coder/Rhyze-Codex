import { describe, expect, it } from 'vitest';
import {
  commissionCentsForProduct,
  isReferralEligibleProduct,
  referralDiscountCents,
} from '@/lib/domain/referrals/referral-service';

describe('referral purchase rules', () => {
  it('calculates a five percent discount in integer cents', () => {
    expect(referralDiscountCents(2_500)).toBe(125);
    expect(referralDiscountCents(16_999)).toBe(850);
  });

  it('pays twenty dollars for memberships', () => {
    expect(commissionCentsForProduct('MONTHLY_UNLIMITED')).toBe(2_000);
    expect(commissionCentsForProduct('LIMITED_MEMBERSHIP')).toBe(2_000);
    expect(commissionCentsForProduct('VIP')).toBe(2_000);
  });

  it('permits one-time referral discounts on paid memberships and a drop-in', () => {
    expect(isReferralEligibleProduct('MONTHLY_UNLIMITED')).toBe(true);
    expect(isReferralEligibleProduct('LIMITED_MEMBERSHIP')).toBe(true);
    expect(isReferralEligibleProduct('VIP')).toBe(true);
    expect(isReferralEligibleProduct('DROP_IN')).toBe(true);
    expect(isReferralEligibleProduct('CLASS_PACK')).toBe(false);
    expect(isReferralEligibleProduct('INTRO_TRIAL')).toBe(false);
    expect(commissionCentsForProduct('DROP_IN')).toBe(500);
    expect(commissionCentsForProduct('CLASS_PACK')).toBe(0);
    expect(commissionCentsForProduct('INTRO_TRIAL')).toBe(0);
  });
});
