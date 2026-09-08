import { describe, expect, it } from 'vitest';
import { memberSpendTotals } from '@/lib/admin/member-spend';

describe('memberSpendTotals', () => {
  const now = new Date('2026-07-28T16:00:00.000Z');

  it('combines net successful Rhyze payments and imported Somble transactions', () => {
    expect(
      memberSpendTotals(
        {
          nativePayments: [
            {
              amountCents: 10_000,
              refundedAmountCents: 2_000,
              status: 'PARTIALLY_REFUNDED',
              occurredAt: new Date('2026-06-01T16:00:00.000Z'),
            },
          ],
          sombleTransactions: [
            {
              amountCents: 2_500,
              transferredAt: new Date('2026-07-01T16:00:00.000Z'),
            },
          ],
        },
        now,
      ),
    ).toEqual({ yearlyCents: 10_500, lifetimeCents: 10_500 });
  });

  it('includes older payments only in lifetime spend', () => {
    expect(
      memberSpendTotals(
        {
          nativePayments: [
            {
              amountCents: 5_000,
              refundedAmountCents: 0,
              status: 'SUCCEEDED',
              occurredAt: new Date('2025-12-15T16:00:00.000Z'),
            },
          ],
          sombleTransactions: [],
        },
        now,
      ),
    ).toEqual({ yearlyCents: 0, lifetimeCents: 5_000 });
  });

  it('excludes failed and disputed Rhyze payment records', () => {
    expect(
      memberSpendTotals(
        {
          nativePayments: [
            {
              amountCents: 5_000,
              refundedAmountCents: 0,
              status: 'FAILED',
              occurredAt: now,
            },
            {
              amountCents: 4_000,
              refundedAmountCents: 0,
              status: 'DISPUTED',
              occurredAt: now,
            },
          ],
          sombleTransactions: [],
        },
        now,
      ),
    ).toEqual({ yearlyCents: 0, lifetimeCents: 0 });
  });

  it('uses the New York calendar year at the UTC year boundary', () => {
    const newYearsEveInNewYork = new Date('2027-01-01T02:00:00.000Z');

    expect(
      memberSpendTotals(
        {
          nativePayments: [
            {
              amountCents: 2_500,
              refundedAmountCents: 0,
              status: 'SUCCEEDED',
              occurredAt: newYearsEveInNewYork,
            },
          ],
          sombleTransactions: [],
        },
        new Date('2026-12-31T20:00:00.000Z'),
      ),
    ).toEqual({ yearlyCents: 2_500, lifetimeCents: 2_500 });
  });

  it('never reports a negative net payment after refunds', () => {
    expect(
      memberSpendTotals(
        {
          nativePayments: [
            {
              amountCents: 2_500,
              refundedAmountCents: 3_000,
              status: 'REFUNDED',
              occurredAt: now,
            },
          ],
          sombleTransactions: [],
        },
        now,
      ),
    ).toEqual({ yearlyCents: 0, lifetimeCents: 0 });
  });
});
