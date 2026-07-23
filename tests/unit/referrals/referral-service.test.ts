import { describe, expect, it } from 'vitest';
import {
  commissionCentsForProduct,
  referralDiscountCents,
} from '@/lib/domain/referrals/referral-service';

describe('referral purchase rules', () => {
  it('calculates a five percent discount in integer cents', () => {
    expect(referralDiscountCents(2_800)).toBe(140);
    expect(referralDiscountCents(16_999)).toBe(850);
  });

  it('pays five dollars for a single class', () => {
    expect(commissionCentsForProduct('DROP_IN')).toBe(500);
  });

  it('pays twenty dollars for memberships', () => {
    expect(commissionCentsForProduct('MONTHLY_UNLIMITED')).toBe(2_000);
    expect(commissionCentsForProduct('LIMITED_MEMBERSHIP')).toBe(2_000);
    expect(commissionCentsForProduct('VIP')).toBe(2_000);
  });

  it('does not commission class packs or intro trials as memberships', () => {
    expect(commissionCentsForProduct('CLASS_PACK')).toBe(500);
    expect(commissionCentsForProduct('INTRO_TRIAL')).toBe(500);
  });
});
