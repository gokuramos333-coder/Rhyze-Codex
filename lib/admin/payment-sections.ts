const completedStatuses = new Set([
  'PAID',
  'FULFILLMENT_REVIEW',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'DISPUTED',
]);

export function splitCommerceOrders<
  T extends {
    kind: string;
    status: string;
    stripePaymentIntentId?: string | null;
  },
>(orders: T[]) {
  const isDisplayableSale = (order: T) =>
    completedStatuses.has(order.status) ||
    (order.status === 'PENDING' && Boolean(order.stripePaymentIntentId));

  return {
    events: orders.filter(
      (order) => order.kind === 'EVENT' && isDisplayableSale(order),
    ),
    merchandise: orders.filter(
      (order) => order.kind === 'MERCHANDISE' && isDisplayableSale(order),
    ),
  };
}
