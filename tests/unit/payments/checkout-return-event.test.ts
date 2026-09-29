import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { checkoutReturnEvent } from '@/lib/payments/checkout-return-event';
const opened = Date.parse('2026-09-30T22:00Z') / 1000;
const paid = Date.parse('2026-10-01T10:00Z') / 1000;
function fixture() {
  const session = { id: 'cs_ticket', status: 'complete', payment_status: 'paid', amount_total: 1500, currency: 'usd', created: opened, livemode: true, payment_intent: 'pi_ticket' } as Stripe.Checkout.Session;
  const charge = { id: 'ch_ticket', payment_intent: 'pi_ticket', paid: true, captured: true, livemode: true, disputed: false, amount_refunded: 0, amount_captured: 1500, currency: 'usd', created: paid, balance_transaction: { created: paid + 1 } };
  const stripe = { paymentIntents: { retrieve: vi.fn(async () => ({ id: 'pi_ticket', status: 'succeeded', livemode: true, latest_charge: 'ch_ticket' })) }, charges: { retrieve: vi.fn(async () => charge) } } as unknown as Stripe;
  return { session, stripe, charge };
}
describe('provider-verified Checkout return payment time', () => {
  it('uses October capture time even when the first callback precedes the webhook for a September session', async () => {
    const f = fixture();
    expect(await checkoutReturnEvent(f.stripe, f.session)).toMatchObject({ created: paid + 1, data: { object: f.session } });
    expect(f.stripe.charges.retrieve).toHaveBeenCalledWith('ch_ticket', { expand: ['balance_transaction'] });
  });
  it('uses actual charge creation if balance transaction is not yet expanded', async () => {
    const f = fixture(); Object.assign(f.charge, { balance_transaction: null });
    expect(await checkoutReturnEvent(f.stripe, f.session)).toMatchObject({ created: paid });
  });
  it('uses verified completion check time only for a zero-dollar no-payment session', async () => {
    const f = fixture();
    Object.assign(f.session, { amount_total: 0, payment_status: 'no_payment_required', payment_intent: null });
    expect(await checkoutReturnEvent(f.stripe, f.session, new Date(paid * 1000))).toMatchObject({ created: paid });
    expect(f.stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });
  it.each(['refunded', 'disputed', 'unpaid', 'wrong-amount', 'wrong-intent', 'open'])('rejects %s provider state before local fulfillment', async (state) => {
    const f = fixture();
    if (state === 'refunded') f.charge.amount_refunded = 1500;
    if (state === 'disputed') f.charge.disputed = true;
    if (state === 'unpaid') f.charge.paid = false;
    if (state === 'wrong-amount') f.charge.amount_captured = 2500;
    if (state === 'wrong-intent') f.charge.payment_intent = 'pi_other';
    if (state === 'open') f.session.status = 'open';
    await expect(checkoutReturnEvent(f.stripe, f.session)).rejects.toThrow();
  });
});
