import { expect, it, vi } from 'vitest';
import { queueApprovedRefundConfirmation } from '@/lib/payments/refund-review-notification';
it('queues one receipt-bound confirmation only for a succeeded refund', async () => {
  const tx: any = {
    user: {
      findUnique: async () => ({
        id: 'u',
        email: 'member@example.test',
        name: 'Member',
      }),
    },
    emailMessage: { upsert: vi.fn() },
  };
  const payment: any = {
    id: 'p',
    userId: 'u',
    productName: 'November invoice',
  };
  const operation: any = {
    id: 'op',
    kind: 'REFUND',
    amountCents: 1000,
    currency: 'usd',
  };
  await queueApprovedRefundConfirmation(tx, payment, operation, 'PENDING');
  expect(tx.emailMessage.upsert).not.toHaveBeenCalled();
  await queueApprovedRefundConfirmation(tx, payment, operation, 'SUCCEEDED');
  expect(tx.emailMessage.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { dedupeKey: 'financial-refund-confirmed:op' },
      create: expect.objectContaining({
        to: 'member@example.test',
        template: 'PAYMENT_REFUND_CONFIRMATION',
        payload: expect.objectContaining({ amount: 1000 }),
      }),
    }),
  );
});
