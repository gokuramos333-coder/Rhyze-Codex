import { describe, expect, it } from 'vitest';
import {
  vipMonthlyBenefitWindowForDate,
  vipMonthlyBenefitWindowForNextMonth,
} from '@/lib/domain/credits/vip-monthly-benefits';
describe('VIP event benefit studio calendar', () => {
  it('uses the New York month during the UTC month boundary', () => {
    const w = vipMonthlyBenefitWindowForDate(new Date('2026-10-01T01:00:00Z'));
    expect(w.key).toBe('2026-09');
    expect(w.validFrom.toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(w.validUntil.toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });
  it('uses DST-aware midnight at both boundaries', () => {
    const w = vipMonthlyBenefitWindowForDate(new Date('2026-11-15T12:00:00Z'));
    expect(w.validFrom.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(w.validUntil.toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });
  it('normalizes next month across the year boundary', () => {
    const w = vipMonthlyBenefitWindowForNextMonth(
      new Date('2027-01-01T01:00:00Z'),
    );
    expect(w.key).toBe('2027-01');
    expect(w.monthLabel).toBe('January 2027');
    expect(w.validFrom.toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });
});
