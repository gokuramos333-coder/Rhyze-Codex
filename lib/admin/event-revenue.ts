export type EventRevenueOrder = {
  amountCents: number;
  refundedAmountCents: number;
};

export function collectedEventRevenueCents(orders: EventRevenueOrder[]) {
  return orders.reduce(
    (total, order) => total + order.amountCents - order.refundedAmountCents,
    0,
  );
}
