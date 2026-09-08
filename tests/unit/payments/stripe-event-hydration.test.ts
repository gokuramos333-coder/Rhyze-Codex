import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { hydrateInvoiceEvent } from '@/lib/payments/stripe-event-hydration';
import { deriveStripeEventAction } from '@/lib/payments/webhook-processor';

function stripeEvent(type: string, object: Record<string, unknown>) {
  return {
    id: `evt_${type}`,
    type,
    created: 1_785_000_000,
    data: { object },
  } as unknown as Stripe.Event;
}

describe('Stripe invoice event hydration', () => {
  it('loads the invoice payment reference omitted from a thin webhook event', async () => {
    const event = stripeEvent('invoice.paid', {
      id: 'in_renewal',
      amount_paid: 9_200,
      currency: 'usd',
      customer: 'cus_member',
      parent: { subscription_details: { subscription: 'sub_member' } },
    });
    const invoiceClient = {
      retrieve: async (invoiceId: string, params: Stripe.InvoiceRetrieveParams) => {
        if (invoiceId !== 'in_renewal') throw new Error('Wrong invoice requested');
        if (!params.expand?.includes('payments.data.payment')) throw new Error('Payment was not expanded');
        return {
          ...(event.data.object as object),
          payments: { data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_renewal' } }] },
        } as Stripe.Invoice;
      },
    };

    const hydrated = await hydrateInvoiceEvent(event, invoiceClient);

    expect(deriveStripeEventAction(hydrated)).toMatchObject({
      type: 'INVOICE_PAID',
      paymentIntentId: 'pi_renewal',
    });
  });

  it('does not retrieve an invoice for a checkout event', async () => {
    const event = stripeEvent('checkout.session.completed', { id: 'cs_checkout' });
    const invoiceClient = {
      retrieve: async () => {
        throw new Error('Checkout events must not retrieve an invoice');
      },
    };

    await expect(hydrateInvoiceEvent(event, invoiceClient)).resolves.toBe(event);
  });
});
