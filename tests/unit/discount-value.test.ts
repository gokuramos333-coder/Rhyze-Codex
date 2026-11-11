import { describe, expect, it } from 'vitest';
import { calculateDiscountCents, parseDollarDiscount, quoteDiscountValue } from '@/lib/domain/discounts/value';
import { campaignCheckout } from '@/lib/domain/discounts/campaign';

// Arithmetic foundation only. These tests do not claim campaign persistence,
// provider zero-total fulfillment, or concurrent limit enforcement is wired.
describe('exact discount values', () => {
  it.each([
    [9200, 15, 1380], [99, 50, 50], [1, 50, 1], [1, 49, 0],
    [2147483647, 99, 2126008811],
    [Number.MAX_SAFE_INTEGER, 99, 8917127262193581],
  ])('rounds integer cents half up without floating multiplication: %i at %i', (price, percent, result) => {
    expect(calculateDiscountCents(price, { kind: 'PERCENT', percentOff: percent })).toBe(result);
  });
  it('supports fixed USD cents, capped at purchase price with no negative total', () => {
    expect(calculateDiscountCents(9200, { kind: 'FIXED', amountOffCents: 1250 })).toBe(1250);
    expect(calculateDiscountCents(9200, { kind: 'FIXED', amountOffCents: 10000 })).toBe(9200);
  });
  it('commercial discounts exclude birthday 100% gifts', () => {
    expect(() => calculateDiscountCents(9200, { kind: 'PERCENT', percentOff: 100 })).toThrow();
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid price %s', price => {
    expect(() => calculateDiscountCents(price, { kind: 'PERCENT', percentOff: 15 })).toThrow();
  });
  it.each([0, -1, 101, 1.1, NaN, Infinity])('rejects invalid percentage %s', percentOff => {
    expect(() => calculateDiscountCents(9200, { kind: 'PERCENT', percentOff })).toThrow();
  });
  it.each([0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid fixed value %s', amountOffCents => {
    expect(() => calculateDiscountCents(9200, { kind: 'FIXED', amountOffCents })).toThrow();
  });
  it.each([['0.01', 1], ['12.50', 1250], ['12', 1200], ['12.5', 1250], ['21474836.47', 2147483647]])('parses dollar text %s without floating point', (value, cents) => {
    expect(parseDollarDiscount(value)).toBe(cents);
  });
  it.each(['', '0', '0.00', '-1', '+1', '1e2', '1,000', '.50', '1.', '1.001', ' 1 ', '01.00', '21474836.48', 'Infinity'])('rejects malformed/out-of-database-range dollars %s', value => {
    expect(() => parseDollarDiscount(value)).toThrow();
  });
  it('rejects zero-total recurring gifts, including fixed amounts and rounding to zero', () => {
    for (const value of [{ kind: 'PERCENT', percentOff: 100 }, { kind: 'FIXED', amountOffCents: 9200 }] as const) {
      expect(() => quoteDiscountValue(9200, value, 'MONTHLY')).toThrow();
    }
    expect(() => quoteDiscountValue(1, { kind: 'PERCENT', percentOff: 99 }, 'MONTHLY')).toThrow(/zero-total/i);
  });
  it('commercial class packs cannot become gifts via a fixed discount', () => {
    expect(() => quoteDiscountValue(9200, { kind: 'FIXED', amountOffCents: 9200 }, 'ONE_TIME')).toThrow(/zero-total/i);
    expect(() => quoteDiscountValue(9200, { kind: 'PERCENT', percentOff: 100 }, 'ONE_TIME')).toThrow();
    expect(quoteDiscountValue(9200, { kind: 'FIXED', amountOffCents: 1250 }, 'MONTHLY')).toEqual({ discountCents: 1250, amountCents: 7950 });
  });
  it('rejects an unsupported cadence rather than silently treating it as one-time', () => {
    expect(() => quoteDiscountValue(9200, { kind: 'PERCENT', percentOff: 15 }, 'YEARLY' as never)).toThrow();
  });
  it('existing campaign quote rejects fractional product cents', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    expect(() => campaignCheckout({ id:'test', code:'SYNTHETIC15', enabled:true, percentOff:15, productIds:['p'], startsAt:now, endsAt:new Date('2026-11-12T12:00:00Z') }, { id:'p', kind:'CLASS_PACK', billingInterval:'ONE_TIME', priceCents:9200.5 }, now)).toThrow();
  });
});
