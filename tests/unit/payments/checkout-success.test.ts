import { describe, expect, it } from 'vitest';
import { checkoutSuccessContent } from '@/lib/payments/checkout-success';

describe('checkout success content', () => {
  it('confirms an event reservation and sends the member to bookings', () => {
    expect(checkoutSuccessContent('EVENT', true)).toEqual({
      eyebrow: 'Payment received',
      title: 'EVENT BOOKED',
      message: 'Your spot is confirmed. Stripe will email your receipt, and the event now appears in your Rhyze bookings.',
      primaryHref: '/member/bookings',
      primaryLabel: 'View My Bookings',
      clearCart: false,
    });
  });

  it('keeps merchandise fulfillment instructions and clears the cart', () => {
    expect(checkoutSuccessContent('MERCHANDISE', true)).toMatchObject({
      title: 'ORDER CONFIRMED',
      primaryHref: '/shop',
      primaryLabel: 'Back to Shop',
      clearCart: true,
    });
  });

  it('does not claim an event is booked before its webhook is processed', () => {
    expect(checkoutSuccessContent('EVENT', false)).toMatchObject({
      eyebrow: 'Payment processing',
      title: 'CONFIRMING YOUR BOOKING',
      primaryHref: '/events',
      clearCart: false,
    });
  });
});
