import { describe, expect, it } from 'vitest';
import { collectedEventRevenueCents } from '@/lib/admin/event-revenue';

describe('event revenue totals', () => {
  it('counts collected paid event order revenue minus refunds', () => {
    expect(
      collectedEventRevenueCents([
        { amountCents: 3000, refundedAmountCents: 0 },
        { amountCents: 3000, refundedAmountCents: 500 },
      ]),
    ).toBe(5500);
  });
});
