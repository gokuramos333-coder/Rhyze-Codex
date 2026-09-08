import { describe, expect, it } from 'vitest';
import {
  returnedCreditTerms,
  returnedCreditTransactionKey,
} from '@/lib/domain/credits/returned-credit';

describe('returned class credit', () => {
  it('expires exactly 14 days after it is returned', () => {
    const returnedAt = new Date('2026-08-10T15:30:00.000Z');

    expect(returnedCreditTerms(returnedAt)).toEqual({
      validFrom: returnedAt,
      validUntil: new Date('2026-08-24T15:30:00.000Z'),
      quantity: 1,
    });
  });

  it('builds a stable unique key for each source transaction', () => {
    expect(returnedCreditTransactionKey('RHYZE', 'purchase-1')).toBe(
      'returned-credit:RHYZE:purchase-1',
    );
    expect(returnedCreditTransactionKey('SOMBLE', 'transaction-1')).toBe(
      'returned-credit:SOMBLE:transaction-1',
    );
  });
});
