import { describe, expect, it } from 'vitest';
import {
  activeEventBookingValueCents,
  collectedEventRevenueCents,
} from '@/lib/admin/event-revenue';

describe('event revenue totals', () => {
  it('counts collected paid event order revenue minus refunds', () => {
    expect(
      collectedEventRevenueCents([
        { amountCents: 3000, refundedAmountCents: 0 },
        { amountCents: 3000, refundedAmountCents: 500 },
      ]),
    ).toBe(5500);
  });

  it('values only active booked members while preserving historical paid orders', () => {
    expect(
      activeEventBookingValueCents({
        bookings: [{ userId: 'active-a' }, { userId: 'active-b' }],
        orders: [
          { userId: 'active-a', amountCents: 3000, refundedAmountCents: 0, paidAt: new Date('2026-09-01') },
          { userId: 'active-b', amountCents: 3000, refundedAmountCents: 0, paidAt: new Date('2026-09-02') },
          { userId: 'cancelled-c', amountCents: 3000, refundedAmountCents: 0, paidAt: new Date('2026-09-03') },
        ],
      }),
    ).toBe(6000);
  });

  it('uses the newest paid order once when a member has purchased the event more than once', () => {
    expect(
      activeEventBookingValueCents({
        bookings: [{ userId: 'active-a' }],
        orders: [
          { userId: 'active-a', amountCents: 3000, refundedAmountCents: 0, paidAt: new Date('2026-09-01') },
          { userId: 'active-a', amountCents: 3500, refundedAmountCents: 0, paidAt: new Date('2026-09-03') },
        ],
      }),
    ).toBe(3500);
  });

  it('does not double count orders that moved from email-only to a linked member', () => {
    expect(
      activeEventBookingValueCents({
        bookings: [{ userId: 'active-a', email: 'member@example.com' }],
        orders: [
          { customerEmail: 'MEMBER@example.com', amountCents: 3000, refundedAmountCents: 0, paidAt: new Date('2026-09-01') },
          { userId: 'active-a', amountCents: 3500, refundedAmountCents: 0, paidAt: new Date('2026-09-03') },
        ],
      }),
    ).toBe(3500);
  });
});
