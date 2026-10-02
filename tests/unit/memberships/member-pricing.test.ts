import { describe, it, expect } from 'vitest';
import {
  parseMemberPricing,
  memberCouponParams,
  memberPricingLabel,
} from '@/lib/domain/memberships/member-pricing';
describe('client-specific monthly pricing', () => {
  const input = {
    monthlyPrice: '199',
    discountDuration: 'repeating',
    discountMonths: '3',
    discountReason: 'Owner approved offer',
  };
  it('keeps VIP catalog price while computing exact client discount and duration', () => {
    const p = parseMemberPricing(input, 22200)!;
    expect(p).toMatchObject({
      monthlyCents: 19900,
      regularCents: 22200,
      amountOff: 2300,
      months: 3,
    });
    expect(memberCouponParams(p, 'client', 'vip', 'prod_vip')).toMatchObject({
      amount_off: 2300,
      duration: 'repeating',
      duration_in_months: 3,
      max_redemptions: 1,
      applies_to: { products: ['prod_vip'] },
      metadata: { userId: 'client' },
    });
    expect(memberPricingLabel(p)).toContain('then $222.00/month');
  });
  it('requires explicit duration and rejects unsafe or ambiguous amounts', () => {
    for (const monthlyPrice of ['-1', '0', '223', '1.001', '1e2', 'NaN'])
      expect(() =>
        parseMemberPricing({ ...input, monthlyPrice }, 22200),
      ).toThrow();
    for (const discountMonths of ['0', '1.5', '37', 'abc'])
      expect(() =>
        parseMemberPricing({ ...input, discountMonths }, 22200),
      ).toThrow();
    expect(() =>
      parseMemberPricing({ ...input, discountDuration: '' }, 22200),
    ).toThrow();
  });
  it('supports indefinite pricing and explicit return to regular pricing', () => {
    expect(
      parseMemberPricing({ ...input, discountDuration: 'forever' }, 22200),
    ).toMatchObject({ months: null, duration: 'forever' });
    expect(
      parseMemberPricing({ ...input, monthlyPrice: '222' }, 22200)?.amountOff,
    ).toBe(0);
    expect(parseMemberPricing({}, 22200)).toBeNull();
  });
});
