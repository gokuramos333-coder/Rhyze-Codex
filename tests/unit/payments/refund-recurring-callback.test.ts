import { describe, it, expect, vi } from 'vitest';
import { preserveApprovedRecurringService } from '@/lib/payments/refund-recurring-callback';
function fixture() {
  const payment = {
    id: 'p',
    bookingId: null,
    stripePaymentIntentId: 'pi',
    stripeInvoiceId: 'in',
    stripeSubscriptionId: 'sub',
    amountCents: 1000,
    currency: 'usd',
  };
  const refund = {
    id: 're',
    payment_intent: 'pi',
    charge: 'ch',
    status: 'succeeded',
    amount: 1000,
    currency: 'usd',
    metadata: { approvedOperationId: 'op' },
  };
  const op = {
    id: 'op',
    amountCents: 1000,
    providerId: null,
    payload: {
      paymentIntentId: 'pi',
      chargeId: 'ch',
      servicePolicy: 'PRESERVE_RECURRING_SERVICE',
      invoiceId: 'in',
      subscriptionId: 'sub',
      livemode: false,
    },
  };
  const charge = {
    id: 'ch',
    payment_intent: 'pi',
    amount_refunded: 1000,
    currency: 'usd',
    livemode: false,
    refunds: { has_more: false, data: [refund] },
  };
  const tx: any = {
    paymentRecord: { findUnique: async () => payment },
    $executeRaw: vi.fn(),
    $queryRaw: async () => [op],
  };
  return {
    tx,
    payment,
    refund,
    op,
    charge,
    event: { type: 'charge.refunded', data: { object: charge } } as any,
  };
}
describe('recurring approved cash refund callback', () => {
  it('preserves service only for the exact independently bound approved refund', async () => {
    const f = fixture();
    expect(await preserveApprovedRecurringService(f.tx, f.event)).toBe(true);
    expect(f.tx.$executeRaw).toHaveBeenCalled();
  });
  it.each(['amount', 'id', 'partial', 'invoice'])(
    'rejects uncertain %s evidence',
    async (field) => {
      const f = fixture();
      if (field === 'amount') f.refund.amount = 999;
      if (field === 'id') f.op.providerId = 'different' as any;
      if (field === 'partial') f.charge.refunds.has_more = true;
      if (field === 'invoice') f.payment.stripeInvoiceId = 'different';
      await expect(
        preserveApprovedRecurringService(f.tx, f.event),
      ).rejects.toThrow();
    },
  );
  it('retains the normal external refund policy when there is no approved recurring exception', async () => {
    const f = fixture();
    f.tx.$queryRaw = async () => [];
    expect(await preserveApprovedRecurringService(f.tx, f.event)).toBe(false);
  });
});
