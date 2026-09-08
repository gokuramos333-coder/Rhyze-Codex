type NativePayment = {
  amountCents: number;
  refundedAmountCents: number;
  status: string;
  occurredAt: Date;
};

type SombleTransaction = {
  amountCents: number;
  transferredAt: Date;
};

const includedNativeStatuses = new Set([
  'SUCCEEDED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

function newYorkYear(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
  }).format(value);
}

export function memberSpendTotals(
  {
    nativePayments,
    sombleTransactions,
  }: {
    nativePayments: NativePayment[];
    sombleTransactions: SombleTransaction[];
  },
  now = new Date(),
) {
  const currentYear = newYorkYear(now);
  const records = [
    ...nativePayments
      .filter((payment) => includedNativeStatuses.has(payment.status))
      .map((payment) => ({
        amountCents: Math.max(
          0,
          payment.amountCents - payment.refundedAmountCents,
        ),
        occurredAt: payment.occurredAt,
      })),
    ...sombleTransactions.map((transaction) => ({
      amountCents: transaction.amountCents,
      occurredAt: transaction.transferredAt,
    })),
  ];

  return records.reduce(
    (totals, record) => {
      totals.lifetimeCents += record.amountCents;
      if (newYorkYear(record.occurredAt) === currentYear) {
        totals.yearlyCents += record.amountCents;
      }
      return totals;
    },
    { yearlyCents: 0, lifetimeCents: 0 },
  );
}
