import { describe, expect, it, vi } from 'vitest';
import { queuePaymentFailureEmail } from '@/lib/notifications/payment-failure';
const user = { id: 'member', email: 'member@example.test', name: 'Test' };
const invoice = {
  id: 'in_unpaid',
  status: 'open',
  amount_due: 19900,
  currency: 'usd',
};
function fixture(status: string | null = null) {
  const tx: any = {
    paymentRecord: {
      findUnique: vi.fn(async () => (status ? { status } : null)),
    },
    emailMessage: { upsert: vi.fn(async () => ({})) },
  };
  return tx;
}
describe('membership payment failure notice', () => {
  it('uses the outstanding amount and a stable per-invoice key, without resetting delivery state', async () => {
    const tx = fixture();
    await queuePaymentFailureEmail(tx, user, {
      ...invoice,
      amount_remaining: 9900,
    });
    expect(tx.emailMessage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: 'payment-failed:in_unpaid' },
        update: {},
        create: expect.objectContaining({
          template: 'PAYMENT_FAILED',
          to: user.email,
          payload: expect.objectContaining({
            amountCents: 9900,
            billingUrl: '/sign-in?callbackUrl=%2Fmember%2Fbilling',
          }),
        }),
      }),
    );
  });
  it.each(['paid', 'void', 'uncollectible', 'draft'])(
    'does not request payment for a currently %s invoice',
    async (status) => {
      const tx = fixture();
      await queuePaymentFailureEmail(tx, user, { ...invoice, status });
      expect(tx.emailMessage.upsert).not.toHaveBeenCalled();
    },
  );
  it.each(['SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'])(
    'does not request payment after recorded %s settlement',
    async (status) => {
      const tx = fixture(status);
      await queuePaymentFailureEmail(tx, user, invoice);
      expect(tx.emailMessage.upsert).not.toHaveBeenCalled();
    },
  );
  it.each([0, -100, 1.5, NaN])(
    'rejects an invalid or settled remaining amount %s',
    async (amount_remaining) => {
      const tx = fixture();
      await queuePaymentFailureEmail(tx, user, {
        ...invoice,
        amount_remaining,
      });
      expect(tx.emailMessage.upsert).not.toHaveBeenCalled();
    },
  );
});
