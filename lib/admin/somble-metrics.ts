export type SombleMetricTransaction = {
  amountCents: number;
  contentType: string;
  userId: string;
};

export function calculateSombleMetrics(
  transactions: SombleMetricTransaction[],
) {
  const revenueByType: Record<string, number> = {};
  const customers = new Set<string>();
  let transferredRevenueCents = 0;

  for (const transaction of transactions) {
    transferredRevenueCents += transaction.amountCents;
    customers.add(transaction.userId);
    revenueByType[transaction.contentType] =
      (revenueByType[transaction.contentType] ?? 0) + transaction.amountCents;
  }

  return {
    transferredRevenueCents,
    uniqueCustomerCount: customers.size,
    averagePerCustomerCents: customers.size
      ? Math.round(transferredRevenueCents / customers.size)
      : 0,
    revenueByType,
  };
}
