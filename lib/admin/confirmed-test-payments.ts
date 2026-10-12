// Exact provider-mode evidence retrieved from Stripe account acct_1Tu0UqRIYui0I7dP
// on 2026-10-12. These historical TEST intents were accidentally retained in
// application records. Preserve the records, but exclude them from sales/review
// totals. This is API evidence, never a fabricated signed webhook receipt.
// Receipt: ~/Inbox/rhyze-audit-cleanup-20261011/test-payment-provenance.json
export const confirmedTestPayments = [
  {
    "id": "pi_3UILi4RIYui0I7dP0Z3Dbt2Z",
    "amountCents": 5827,
    "currency": "usd"
  },
  {
    "id": "pi_3UILhuRIYui0I7dP0DsqengY",
    "amountCents": 9200,
    "currency": "usd"
  },
  {
    "id": "pi_3UILhlRIYui0I7dP0ARAoLJz",
    "amountCents": 16800,
    "currency": "usd"
  },
  {
    "id": "pi_3UILhSRIYui0I7dP0PHAe3og",
    "amountCents": 9200,
    "currency": "usd"
  },
  {
    "id": "pi_3UILhKRIYui0I7dP1bXfNSOb",
    "amountCents": 5329,
    "currency": "usd"
  },
  {
    "id": "pi_3UILh3RIYui0I7dP1nwMVK3M",
    "amountCents": 9200,
    "currency": "usd"
  },
  {
    "id": "pi_3UILgtRIYui0I7dP1y6fSDVu",
    "amountCents": 16800,
    "currency": "usd"
  },
  {
    "id": "pi_3UILgiRIYui0I7dP0xXIXLxq",
    "amountCents": 16800,
    "currency": "usd"
  },
  {
    "id": "pi_3UILgYRIYui0I7dP1CCuXFfW",
    "amountCents": 5827,
    "currency": "usd"
  },
  {
    "id": "pi_3UILgPRIYui0I7dP1jDORqYC",
    "amountCents": 9200,
    "currency": "usd"
  },
  {
    "id": "pi_3UILeLRIYui0I7dP0eVi2EZO",
    "amountCents": 5827,
    "currency": "usd"
  },
  {
    "id": "pi_3UILeBRIYui0I7dP0xyCH4jA",
    "amountCents": 9200,
    "currency": "usd"
  },
  {
    "id": "pi_3UILe3RIYui0I7dP1BL6cVRE",
    "amountCents": 16800,
    "currency": "usd"
  },
  {
    "id": "pi_3UILdmRIYui0I7dP1OnsQuEK",
    "amountCents": 9200,
    "currency": "usd"
  },
  {
    "id": "pi_3UILdeRIYui0I7dP10XOAuSo",
    "amountCents": 5329,
    "currency": "usd"
  },
  {
    "id": "pi_3UILdORIYui0I7dP0kVMnjK4",
    "amountCents": 9200,
    "currency": "usd"
  },
  {
    "id": "pi_3UILdARIYui0I7dP1RfELzSB",
    "amountCents": 16800,
    "currency": "usd"
  },
  {
    "id": "pi_3UILd6RIYui0I7dP0OdUijHa",
    "amountCents": 5827,
    "currency": "usd"
  },
  {
    "id": "pi_3UILcyRIYui0I7dP1PiQsP2F",
    "amountCents": 9200,
    "currency": "usd"
  },
  {
    "id": "pi_3UIC5jRIYui0I7dP1eZYQF6K",
    "amountCents": 19900,
    "currency": "usd"
  },
  {
    "id": "pi_3Txd2DRIYui0I7dP1wpZfr8B",
    "amountCents": 3000,
    "currency": "usd"
  },
  {
    "id": "pi_3TxcuuRIYui0I7dP0TC0PQnW",
    "amountCents": 9200,
    "currency": "usd"
  }
] as const;
export function isConfirmedTestPayment(item: {stripePaymentIntentId?:string|null;amountCents?:number;currency?:string}) {
  return confirmedTestPayments.some(proof => proof.id === item.stripePaymentIntentId && proof.amountCents === item.amountCents && proof.currency === item.currency?.toLowerCase());
}
