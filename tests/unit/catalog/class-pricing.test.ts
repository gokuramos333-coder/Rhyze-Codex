import { describe, expect, it } from 'vitest';
import {
  parseClassPriceCents,
  shouldSyncOccurrencePrice,
} from '@/lib/catalog/class-pricing';

describe('class pricing', () => {
  it('converts editable dollar prices to cents', () => {
    expect(parseClassPriceCents('25')).toBe(2500);
    expect(parseClassPriceCents('31.50')).toBe(3150);
  });

  it('rejects empty, zero, negative, and invalid prices', () => {
    expect(parseClassPriceCents('')).toBeNull();
    expect(parseClassPriceCents('0')).toBeNull();
    expect(parseClassPriceCents('-5')).toBeNull();
    expect(parseClassPriceCents('not-a-price')).toBeNull();
  });

  it('syncs inherited occurrence prices but preserves deliberate overrides', () => {
    expect(shouldSyncOccurrencePrice(2500, 2500)).toBe(true);
    expect(shouldSyncOccurrencePrice(2500, null)).toBe(true);
    expect(shouldSyncOccurrencePrice(2500, 3500)).toBe(false);
  });
});
