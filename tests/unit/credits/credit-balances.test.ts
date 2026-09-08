import { describe, expect, it } from 'vitest';
import {
  availableCreditSummary,
  classCreditDisplayLabel,
  separatedAvailableCreditBalances,
} from '@/lib/domain/credits/credit-balances';
import { vipMonthlyBenefitWindow } from '@/lib/domain/credits/vip-monthly-benefits';

describe('separated available credit balances', () => {
  it('keeps event-only credits out of the class-credit total', () => {
    expect(separatedAvailableCreditBalances([
      { label: 'Ritual membership', available: 4 },
      { label: 'Event credit — TCJ Hip-Hop Happy Hour', available: 1 },
      { label: 'Event credit — expired', available: 0 },
      { label: 'Manual admin credit', available: 2 },
    ])).toEqual({ classCredits: 6, eventCredits: 1 });
  });

  it('never displays negative ledger balances', () => {
    expect(separatedAvailableCreditBalances([
      { label: 'Ritual membership', available: -2 },
      { label: 'Event credit — TCJ Hip-Hop Happy Hour', available: -1 },
    ])).toEqual({ classCredits: 0, eventCredits: 0 });
  });

  it('preserves unlimited class access separately from numeric balances', () => {
    const summary = availableCreditSummary([
      { label: 'VIP membership', available: 0, isUnlimited: true },
      { label: 'Event credit — transfer', available: 1, isUnlimited: false },
    ]);

    expect(summary).toEqual({
      classCredits: 0,
      eventCredits: 1,
      hasUnlimitedClassAccess: true,
    });
    expect(classCreditDisplayLabel(summary, 'VIP')).toBe(
      'UNLIMITED WITH VIP MEMBERSHIP STATUS',
    );
  });

  it('labels the $7 intro trial as unlimited class credits for seven days', () => {
    const summary = availableCreditSummary([
      {
        label: 'Intro trial — unlimited standard class credits for 7 days',
        available: 0,
        isUnlimited: true,
      },
    ]);

    expect(classCreditDisplayLabel(summary, 'INTRO_TRIAL')).toBe(
      'UNLIMITED ACCESS / 7 DAY TRIAL',
    );
  });

  it('labels September VIP benefits as unlimited classes plus one non-rollover event credit', () => {
    const window = vipMonthlyBenefitWindow({ year: 2026, monthIndex: 8 });

    expect(window.classCreditLabel).toBe('VIP membership — unlimited standard class credits — September 2026');
    expect(window.eventCreditLabel).toBe(
      'Event credit — September 2026 VIP complimentary event credit — expires 2026-09-30',
    );
    expect(window.validFrom).toEqual(new Date('2026-09-01T04:00:00.000Z'));
    expect(window.validUntil).toEqual(new Date('2026-10-01T04:00:00.000Z'));
    expect(window.eventGrantReason).toContain('no rollover');
    expect(window.eventGrantReason).toContain('excludes Tricia Johnsen specialty events');
  });
});
