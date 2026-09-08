import { describe, expect, it } from 'vitest';
import { splitCommerceOrders } from '@/lib/admin/payment-sections';

describe('admin payment sections', () => {
  it('shows completed sales and omits abandoned checkout attempts', () => {
    const orders = [
      { id: 'event-1', kind: 'EVENT', status: 'PAID' },
      { id: 'merch-1', kind: 'MERCHANDISE', status: 'PENDING' },
      { id: 'event-2', kind: 'EVENT', status: 'FULFILLMENT_REVIEW' },
      { id: 'merch-2', kind: 'MERCHANDISE', status: 'REFUNDED' },
      {
        id: 'event-3',
        kind: 'EVENT',
        status: 'PENDING',
        stripePaymentIntentId: 'pi_submitted',
      },
    ];
    expect(splitCommerceOrders(orders)).toEqual({
      events: [orders[0], orders[2], orders[4]],
      merchandise: [orders[3]],
    });
  });
});
