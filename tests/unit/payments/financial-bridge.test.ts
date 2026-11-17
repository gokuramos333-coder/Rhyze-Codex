import { it, expect, vi } from 'vitest';
import { closeLegacyFinancialWriters } from '@/lib/payments/financial-bridge';
it('unconditionally rejects every direct refund/fee create without touching the provider', () => {
  const refund = vi.fn(),
    fee = vi.fn(),
    retrieve = vi.fn();
  const checkout = vi.fn();
  const client: any = {
    refunds: { create: refund, retrieve },
    paymentIntents: { create: fee, retrieve },
    checkout: { sessions: { create: checkout } },
  };
  const closed = closeLegacyFinancialWriters(client);
  expect(() => closed.refunds.create({ payment_intent: 'pi_fixture' })).toThrow(
    'paused',
  );
  expect(() =>
    closed.paymentIntents.create({ amount: 1000, currency: 'usd' }),
  ).toThrow('paused');
  expect(refund).not.toHaveBeenCalled();
  expect(fee).not.toHaveBeenCalled();
  closed.checkout.sessions.create({
    metadata: { occurrenceId: 'another-event' },
  });
  expect(checkout).toHaveBeenCalledTimes(1);
  expect(() =>
    closed.checkout.sessions.create({
      metadata: { occurrenceId: 'cmvv9bp4g0001gt09ewtk8n57' },
    }),
  ).toThrow('temporarily paused');
  expect(checkout).toHaveBeenCalledTimes(1);
  expect(closed.refunds.retrieve).toBe(retrieve);
});
