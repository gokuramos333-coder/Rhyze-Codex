import { netCollectedAmountCents } from '@/lib/admin/net-revenue';

export type EventRevenueOrder = {
  userId?: string | null;
  customerEmail?: string | null;
  amountCents: number;
  refundedAmountCents: number;
  paidAt?: Date | null;
};

export function collectedEventRevenueCents(orders: EventRevenueOrder[]) {
  return orders.reduce(
    (total, order) => total + netCollectedAmountCents(order),
    0,
  );
}

export function activeEventBookingValueCents(input: {
  bookings: Array<{ userId: string; email?: string | null }>;
  orders: EventRevenueOrder[];
}) {
  const uniqueBookings = new Map(
    input.bookings.map((booking) => [booking.userId, booking]),
  );
  return [...uniqueBookings.values()].reduce((total, booking) => {
    const email = booking.email?.trim().toLowerCase();
    const newestOrder = input.orders.reduce<EventRevenueOrder | null>(
      (newest, order) => {
        const matches =
          order.userId === booking.userId ||
          Boolean(
            email && order.customerEmail?.trim().toLowerCase() === email,
          );
        if (!matches) return newest;
        if (
          !newest ||
          (order.paidAt?.getTime() || 0) >= (newest.paidAt?.getTime() || 0)
        ) {
          return order;
        }
        return newest;
      },
      null,
    );
    if (!newestOrder) return total;
    return (
      total +
      Math.max(
        0,
        newestOrder.amountCents - newestOrder.refundedAmountCents,
      )
    );
  }, 0);
}
