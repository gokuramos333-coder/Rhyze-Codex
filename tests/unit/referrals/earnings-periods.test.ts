import { describe, expect, it } from 'vitest';
import { earningsPeriodStart } from '@/lib/domain/referrals/earnings-periods';

describe('referral earnings periods', () => {
  const now = new Date('2026-07-23T18:00:00Z');
  it('calculates weekly, monthly, yearly, and lifetime starts', () => {
    expect(earningsPeriodStart('week', now)?.toISOString()).toBe('2026-07-20T00:00:00.000Z');
    expect(earningsPeriodStart('month', now)?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(earningsPeriodStart('year', now)?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(earningsPeriodStart('lifetime', now)).toBeNull();
  });
});
