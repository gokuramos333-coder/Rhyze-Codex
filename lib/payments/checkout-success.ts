import type { CommerceOrderKind } from '@prisma/client';

type CheckoutSuccessContent = {
  eyebrow: string;
  title: string;
  message: string;
  primaryHref: string;
  primaryLabel: string;
  clearCart: boolean;
};

export function checkoutSuccessContent(
  kind: CommerceOrderKind | null | undefined,
  paid: boolean,
): CheckoutSuccessContent {
  if (kind === 'EVENT') {
    return paid
      ? {
          eyebrow: 'Payment received',
          title: 'EVENT BOOKED',
          message: 'Your spot is confirmed. Stripe will email your receipt, and the event now appears in your Rhyze bookings.',
          primaryHref: '/member/bookings',
          primaryLabel: 'View My Bookings',
          clearCart: false,
        }
      : {
          eyebrow: 'Payment processing',
          title: 'CONFIRMING YOUR BOOKING',
          message: 'Stripe is securely confirming the payment. Your spot will be reserved after Rhyze receives the verified confirmation.',
          primaryHref: '/events',
          primaryLabel: 'Back to Events',
          clearCart: false,
        };
  }

  return paid
    ? {
        eyebrow: 'Payment received',
        title: 'ORDER CONFIRMED',
        message: 'Stripe will email your receipt. The Rhyze team will follow up with pickup or fulfillment details.',
        primaryHref: '/shop',
        primaryLabel: 'Back to Shop',
        clearCart: kind === 'MERCHANDISE',
      }
    : {
        eyebrow: 'Payment processing',
        title: 'CONFIRMING YOUR ORDER',
        message: 'Stripe is securely confirming the payment. Your order will appear as paid only after Rhyze receives the verified confirmation.',
        primaryHref: '/shop',
        primaryLabel: 'Back to Shop',
        clearCart: false,
      };
}
