import { describe, expect, it } from 'vitest';
import {
  COMMERCE_REVENUE_STATUSES,
  PURCHASE_REVENUE_STATUSES,
  netCollectedAmountCents,
  paymentRecordFinancialTotals,
  sumNetCollectedAmounts,
} from '@/lib/admin/net-revenue';

describe('net revenue accounting', () => {
  it('retains the unrefunded portion of a partially refunded payment', () => {
    expect(netCollectedAmountCents({ amountCents: 3_000, refundedAmountCents: 500 })).toBe(2_500);
    expect(netCollectedAmountCents({ amountCents: 3_000, refundedAmountCents: 3_000 })).toBe(0);
    expect(netCollectedAmountCents({ amountCents: 3_000, refundedAmountCents: 4_000 })).toBe(0);
  });

  it('sums paid, partially refunded, and refunded ledger rows without dropping remaining value', () => {
    expect(sumNetCollectedAmounts([
      { amountCents: 9_200, refundedAmountCents: 0 },
      { amountCents: 3_000, refundedAmountCents: 1_000 },
      { amountCents: 2_500, refundedAmountCents: 2_500 },
    ])).toBe(11_200);
    expect(PURCHASE_REVENUE_STATUSES).toEqual(['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']);
    expect(COMMERCE_REVENUE_STATUSES).toEqual(['PAID', 'FULFILLMENT_REVIEW', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED']);
  });

  it('reports Stripe gross, adjustments, and net without counting failed charges', () => {
    expect(paymentRecordFinancialTotals([
      { status: 'SUCCEEDED', amountCents: 9_200, refundedAmountCents: 0 },
      { status: 'PARTIALLY_REFUNDED', amountCents: 3_000, refundedAmountCents: 500 },
      { status: 'REFUNDED', amountCents: 2_500, refundedAmountCents: 2_500 },
      { status: 'DISPUTED', amountCents: 3_000, refundedAmountCents: 0 },
      { status: 'FAILED', amountCents: 19_900, refundedAmountCents: 0 },
    ])).toEqual({
      grossCents: 17_700,
      adjustmentCents: 6_000,
      netCents: 11_700,
    });
  });
});
