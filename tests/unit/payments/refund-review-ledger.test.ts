import { expect, it, vi } from 'vitest';
import { financialLedgerLock } from '@/lib/payments/refund-review';
it('locks financial ownership, member entitlements, original purchase then receipt and rereads', async () => {
  const calls: string[] = [];
  const payment = {
    id: 'p',
    bookingId: null,
    userId: 'u',
    purchaseId: 'sale',
    membershipId: 'm',
    stripePaymentIntentId: 'pi',
  };
  const tx: any = {
    paymentRecord: {
      findUnique: vi.fn(async () => {
        calls.push('read');
        return payment;
      }),
    },
    $executeRaw: async (s: TemplateStringsArray) => {
      calls.push(s.join(''));
      return 1;
    },
    $queryRaw: async (s: TemplateStringsArray) => {
      calls.push(s.join(''));
      return [];
    },
  };
  expect(await financialLedgerLock(tx, 'p')).toBe(payment);
  expect(calls.findIndex((x) => x.includes('hashtext('))).toBeLessThan(
    calls.findIndex((x) => x.includes('hashtextextended')),
  );
  expect(calls.findIndex((x) => x.includes('"Purchase"'))).toBeLessThan(
    calls.findIndex((x) => x.includes('"PaymentRecord"')),
  );
  expect(calls.at(-1)).toBe('read');
});
