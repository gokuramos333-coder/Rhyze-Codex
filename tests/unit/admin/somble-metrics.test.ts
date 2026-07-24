import { describe, expect, it } from 'vitest';
import { calculateSombleMetrics } from '@/lib/admin/somble-metrics';

describe('Somble ADMIN metrics', () => {
  it('calculates transferred revenue, distribution, and unique customers', () => {
    const result = calculateSombleMetrics([
      { amountCents: 700, contentType: 'Classpack', userId: 'one' },
      { amountCents: 3000, contentType: 'Event', userId: 'one' },
      { amountCents: 9200, contentType: 'Subscription', userId: 'two' },
    ]);

    expect(result).toEqual({
      transferredRevenueCents: 12900,
      uniqueCustomerCount: 2,
      averagePerCustomerCents: 6450,
      revenueByType: {
        Classpack: 700,
        Event: 3000,
        Subscription: 9200,
      },
    });
  });

  it('returns zero-safe averages for no transactions', () => {
    expect(calculateSombleMetrics([]).averagePerCustomerCents).toBe(0);
  });
});
