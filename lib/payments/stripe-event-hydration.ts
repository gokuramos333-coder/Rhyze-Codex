import type Stripe from 'stripe';

type InvoiceClient = {
  retrieve(
    invoiceId: string,
    params: Stripe.InvoiceRetrieveParams,
  ): Promise<Stripe.Invoice>;
};

export async function hydrateInvoiceEvent(
  event: Stripe.Event,
  invoices: InvoiceClient,
): Promise<Stripe.Event> {
  if (event.type !== 'invoice.paid' && event.type !== 'invoice.payment_failed') return event;

  const invoice = await invoices.retrieve(String(event.data.object.id), {
    expand: ['payments.data.payment'],
  });

  return {
    ...event,
    data: { ...event.data, object: invoice },
  } as Stripe.Event;
}
