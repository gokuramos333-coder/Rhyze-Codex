import { expect, it, vi } from 'vitest';
import { originalPurchaseRefundPayment } from '@/lib/payments/refund-review';
it('selects the original receipt rather than an arbitrary later invoice with the same purchaseId', async () => {
  const db: any = {
    purchase: {
      findUniqueOrThrow: async () => ({
        id: 'purchase',
        stripePaymentIntentId: 'original',
        userId: 'member',
      }),
    },
    paymentRecord: {
      findUnique: vi.fn(async () => ({
        id: 'payment',
        purchaseId: 'purchase',
        userId: 'member',
        stripePaymentIntentId: 'original',
      })),
    },
  };
  expect(
    await originalPurchaseRefundPayment(db, 'purchase', 'member'),
  ).toMatchObject({ id: 'payment' });
  expect(db.paymentRecord.findUnique).toHaveBeenCalledWith({
    where: { stripePaymentIntentId: 'original' },
  });
  await expect(
    originalPurchaseRefundPayment(db, 'purchase', 'wrong'),
  ).rejects.toThrow(/member/);
});
