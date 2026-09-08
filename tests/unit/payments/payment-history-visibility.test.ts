import { describe, expect, it } from 'vitest';
import { isVisiblePaymentHistoryPurchase } from '@/lib/payments/payment-history-visibility';

describe('payment history visibility', () => {
  it('hides an abandoned Stripe Checkout draft', () => {
    expect(
      isVisiblePaymentHistoryPurchase({
        status: 'PENDING',
        stripePaymentIntentId: null,
      }),
    ).toBe(false);
  });

  it('keeps a pending payment that Stripe actually submitted', () => {
    expect(
      isVisiblePaymentHistoryPurchase({
        status: 'PENDING',
        stripePaymentIntentId: 'pi_submitted',
      }),
    ).toBe(true);
  });

  it.each(['PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'])(
    'keeps the completed payment lifecycle status %s',
    (status) => {
      expect(
        isVisiblePaymentHistoryPurchase({
          status,
          stripePaymentIntentId: null,
        }),
      ).toBe(true);
    },
  );
});
