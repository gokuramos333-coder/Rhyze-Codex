import { describe, expect, it } from 'vitest';
import {
  isProductAvailable,
  productAvailabilityMessage,
} from '@/lib/catalog/product-availability';

describe('product availability', () => {
  const trialAvailableToday = new Date('2026-07-30T00:00:00-04:00');

  it('blocks the opening trial before July 30 and allows it today', () => {
    const trial = {
      isActive: true,
      isPublic: true,
      alwaysAvailable: false,
      availabilityStart: trialAvailableToday,
      availabilityEnd: null,
    };

    expect(
      isProductAvailable(trial, new Date('2026-07-29T23:59:59-04:00')),
    ).toBe(false);
    expect(isProductAvailable(trial, trialAvailableToday)).toBe(true);
  });

  it('treats the $7 intro trial as available today even if the stored catalog date is stale', () => {
    const trial = {
      isActive: true,
      isPublic: true,
      alwaysAvailable: false,
      availabilityStart: new Date('2026-08-03T00:00:00-04:00'),
      availabilityEnd: null,
      kind: 'INTRO_TRIAL',
      priceCents: 700,
    };

    expect(isProductAvailable(trial, trialAvailableToday)).toBe(true);
    expect(productAvailabilityMessage(trial, trialAvailableToday)).toBeNull();
  });

  it('requires active and public products', () => {
    expect(
      isProductAvailable(
        {
          isActive: false,
          isPublic: true,
          alwaysAvailable: true,
          availabilityStart: null,
          availabilityEnd: null,
        },
        trialAvailableToday,
      ),
    ).toBe(false);
  });

  it('keeps a future plan visible with a clear opening date', () => {
    const trial = {
      isActive: true,
      isPublic: true,
      alwaysAvailable: false,
      availabilityStart: trialAvailableToday,
      availabilityEnd: null,
    };

    expect(
      productAvailabilityMessage(
        trial,
        new Date('2026-07-24T12:00:00-04:00'),
      ),
    ).toBe('Available July 30');
  });
});
