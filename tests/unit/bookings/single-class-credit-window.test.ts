import { describe, expect, it } from 'vitest';
import { standardSingleClassCreditCanBook } from '@/lib/domain/bookings/booking-rules';

describe('standard single-class credit booking window', () => {
  it('allows a paid drop-in credit to book any standard class in the purchase month immediately', () => {
    const paidAt = new Date('2026-08-03T16:00:00.000Z');

    expect(standardSingleClassCreditCanBook({
      productKind: 'DROP_IN',
      paidAt,
      occurrenceStartsAt: new Date('2026-08-03T22:10:00.000Z'),
      isEvent: false,
    })).toBe(true);
    expect(standardSingleClassCreditCanBook({
      productKind: 'DROP_IN',
      paidAt,
      occurrenceStartsAt: new Date('2026-08-31T23:00:00.000Z'),
      isEvent: false,
      validUntil: new Date('2026-09-03T16:00:00.000Z'),
    })).toBe(true);
  });

  it('does not let standard single-class credits roll into events or a different month', () => {
    const paidAt = new Date('2026-08-03T16:00:00.000Z');

    expect(standardSingleClassCreditCanBook({
      productKind: 'DROP_IN',
      paidAt,
      occurrenceStartsAt: new Date('2026-08-15T14:00:00.000Z'),
      isEvent: true,
    })).toBe(false);
    expect(standardSingleClassCreditCanBook({
      productKind: 'DROP_IN',
      paidAt,
      occurrenceStartsAt: new Date('2026-09-01T04:00:00.000Z'),
      isEvent: false,
      validUntil: new Date('2026-08-31T23:59:59.000Z'),
    })).toBe(false);
    expect(standardSingleClassCreditCanBook({
      productKind: 'LIMITED_MEMBERSHIP',
      paidAt,
      occurrenceStartsAt: new Date('2026-08-15T14:00:00.000Z'),
      isEvent: false,
    })).toBe(false);
  });
});
