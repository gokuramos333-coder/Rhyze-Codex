import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export class CashRefundCreditConflictError extends Error {
  constructor(
    message = 'This booking already has a cash refund in progress or completed.',
  ) {
    super(message);
    this.name = 'CashRefundCreditConflictError';
  }
}

export async function assertNoCashRefundForBooking(
  tx: Tx,
  booking: { id: string; occurrenceId: string; userId: string },
) {
  const explicitRefund = await tx.commerceRefund.findFirst({
    where: {
      bookingId: booking.id,
      status: { in: ['PENDING', 'SUCCEEDED'] },
    },
    select: { id: true },
  });
  if (explicitRefund) {
    throw new CashRefundCreditConflictError();
  }

  const finalizedOrder = await tx.commerceOrder.findFirst({
    where: {
      occurrenceId: booking.occurrenceId,
      userId: booking.userId,
      kind: 'EVENT',
      status: { in: ['PARTIALLY_REFUNDED', 'REFUNDED'] },
    },
    select: { id: true },
  });
  if (finalizedOrder) {
    throw new CashRefundCreditConflictError(
      'This booking is tied to a finalized cash refund.',
    );
  }
}
