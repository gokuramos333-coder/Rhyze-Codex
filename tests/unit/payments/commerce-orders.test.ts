import { describe, expect, it } from 'vitest';
import {
  CommercePricingError,
  priceEventOrder,
  priceMerchandiseCart,
} from '@/lib/payments/commerce-orders';

describe('server-authoritative commerce pricing', () => {
  it('prices merchandise from the server catalog instead of browser totals', () => {
    expect(priceMerchandiseCart([
      { productId: 'rhyze-up-cropped-tank', size: 'M', qty: 2 },
    ])).toEqual({
      amountCents: 5_000,
      items: [{
        productReference: 'rhyze-up-cropped-tank',
        name: 'Rhyze Up Cropped Tank',
        description: 'Black cropped tank with the Rhyze Up mantra in the studio gradient. Lightweight, breathable, and ready to move.',
        variant: 'M',
        imageUrl: '/shop/rhyze-up-tank-front.webp',
        unitAmountCents: 2_500,
        quantity: 2,
      }],
    });
  });

  it('rejects unavailable variants and excessive quantities', () => {
    expect(() => priceMerchandiseCart([
      { productId: 'rhyze-up-cropped-tank', size: 'INVALID', qty: 1 },
    ])).toThrowError(CommercePricingError);
    expect(() => priceMerchandiseCart([
      { productId: 'rhyze-up-cropped-tank', size: 'M', qty: 11 },
    ])).toThrowError('Quantity must be between 1 and 10.');
  });

  it('prices only scheduled specialty events with remaining capacity', () => {
    const now = new Date('2026-08-01T12:00:00Z');
    expect(priceEventOrder({
      id: 'event_occurrence',
      name: 'TCJ Hip-Hop Happy Hour',
      isEvent: true,
      status: 'SCHEDULED',
      startAt: new Date('2026-08-03T23:15:00Z'),
      priceCents: 3_000,
      capacity: 25,
      booked: 11,
    }, now)).toEqual({
      amountCents: 3_000,
      item: {
        productReference: 'event_occurrence',
        name: 'TCJ Hip-Hop Happy Hour',
        description: 'Specialty event ticket',
        variant: null,
        imageUrl: null,
        unitAmountCents: 3_000,
        quantity: 1,
      },
    });
  });

  it('adds five dollars for each Mommy & Me child after the first', () => {
    const now = new Date('2026-08-20T12:00:00Z');
    expect(priceEventOrder({
      id: 'mommy_occurrence',
      slug: 'mommy-and-me-dennisse',
      name: 'Mommy & Me',
      isEvent: true,
      status: 'SCHEDULED',
      startAt: new Date('2026-09-26T16:00:00Z'),
      priceCents: 3_000,
      capacity: 25,
      booked: 0,
    }, now, { childCount: 3 })).toEqual({
      amountCents: 4_000,
      item: {
        productReference: 'mommy_occurrence',
        name: 'Mommy & Me',
        description: 'Mommy & Me specialty event: 1 parent with 3 children',
        variant: '1 parent + 3 children',
        imageUrl: null,
        unitAmountCents: 4_000,
        quantity: 1,
      },
    });
  });

  it('rejects an invalid Mommy & Me child count', () => {
    const occurrence = {
      id: 'mommy_occurrence',
      slug: 'mommy-and-me-dennisse',
      name: 'Mommy & Me',
      isEvent: true,
      status: 'SCHEDULED',
      startAt: new Date('2026-09-26T16:00:00Z'),
      priceCents: 3_000,
      capacity: 25,
      booked: 0,
    };
    const now = new Date('2026-08-20T12:00:00Z');

    expect(() => priceEventOrder(occurrence, now, { childCount: 0 }))
      .toThrowError('Choose between 1 and 5 children.');
    expect(() => priceEventOrder(occurrence, now, { childCount: 6 }))
      .toThrowError('Choose between 1 and 5 children.');
  });

  it('rejects full, past, cancelled, or standard class occurrences', () => {
    const base = {
      id: 'occurrence',
      name: 'Event',
      isEvent: true,
      status: 'SCHEDULED',
      startAt: new Date('2026-08-03T23:15:00Z'),
      priceCents: 3_000,
      capacity: 25,
      booked: 25,
    };
    const now = new Date('2026-08-01T12:00:00Z');
    expect(() => priceEventOrder(base, now)).toThrowError('This event is sold out.');
    expect(() => priceEventOrder({ ...base, booked: 0, isEvent: false }, now)).toThrowError('Only specialty events use event checkout.');
    expect(() => priceEventOrder({ ...base, booked: 0, status: 'CANCELLED' }, now)).toThrowError('This event is not available.');
    expect(() => priceEventOrder({ ...base, booked: 0, startAt: new Date('2026-07-01T12:00:00Z') }, now)).toThrowError('This event has already started.');
  });
});
