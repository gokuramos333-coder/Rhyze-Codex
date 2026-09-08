import { attendanceStatusCountsAsAttended } from '@/lib/domain/bookings/booking-rules';

type ActivityUser = {
  id: string;
  name: string | null;
  email: string;
  createdAt: Date;
};

type ActivityProduct = {
  name: string;
  billingInterval?: string;
  kind?: string;
  isEvent?: boolean;
};

export type AdminActivityItem = {
  id: string;
  at: Date;
  name: string;
  detail: string;
  href: string;
};

function memberName(user: Pick<ActivityUser, 'name' | 'email'> | null | undefined, fallback?: string | null) {
  return user?.name || fallback || user?.email || 'Unknown client';
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function commerceOrderItemSummary(items: Array<{ name: string; quantity?: number }>) {
  if (!items.length) return 'Order';
  const [first, ...rest] = items;
  const quantity = first.quantity && first.quantity > 1 ? ` × ${first.quantity}` : '';
  return `${first.name}${quantity}${rest.length ? ` +${rest.length} more` : ''}`;
}

function titleCaseKind(kind: string) {
  const label = kind.toLowerCase().replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function buildAdminActivityItems(input: {
  users: ActivityUser[];
  purchases: Array<{
    id: string;
    user: ActivityUser;
    product: ActivityProduct;
    amountCents: number;
    refundedAmountCents: number;
    status: string;
    paidAt: Date | null;
    createdAt: Date;
    refunds?: Array<{
      id: string;
      amountCents: number;
      createdAt: Date;
    }>;
  }>;
  memberships: Array<{
    id: string;
    user: ActivityUser;
    product: Pick<ActivityProduct, 'name'>;
    status: string;
    createdAt: Date;
    currentPeriodStart: Date;
  }>;
  commerceOrders: Array<{
    id: string;
    user: ActivityUser | null;
    customerEmail: string | null;
    kind: string;
    amountCents: number;
    status: string;
    paidAt: Date | null;
    createdAt: Date;
    items: Array<{ name: string; quantity?: number }>;
  }>;
  sombleProfiles: Array<{
    id: string;
    user: ActivityUser;
    sourceJoinedAt: Date;
    sourceStatus: string;
  }>;
  sombleTransactions: Array<{
    id: string;
    user: ActivityUser;
    supporterName: string;
    contentType: string;
    amountCents: number;
    transferredAt: Date;
  }>;
  paymentRecords?: Array<{
    id: string;
    user: ActivityUser | null;
    customerName?: string | null;
    customerEmail?: string | null;
    kind: string;
    status: string;
    amountCents: number;
    refundedAmountCents: number;
    occurredAt: Date;
    purchaseId?: string | null;
    commerceOrderId?: string | null;
  }>;
  bookings?: Array<{
    id: string;
    user: ActivityUser;
    status: string;
    source: string;
    bookedAt: Date;
    cancelledAt: Date | null;
    occurrence: {
      id: string;
      startAt: Date;
      template: Pick<ActivityProduct, 'name' | 'isEvent'>;
    };
  }>;
  waitlistEntries?: Array<{
    id: string;
    user: ActivityUser;
    status: string;
    joinedAt: Date;
    promotedAt: Date | null;
    leftAt: Date | null;
    occurrence: {
      id: string;
      startAt: Date;
      template: Pick<ActivityProduct, 'name' | 'isEvent'>;
    };
  }>;
  attendanceRecords?: Array<{
    id: string;
    user: ActivityUser;
    status: string;
    checkedInAt: Date | null;
    createdAt: Date;
    occurrence: {
      id: string;
      startAt: Date;
      template: Pick<ActivityProduct, 'name' | 'isEvent'>;
    };
  }>;
}): AdminActivityItem[] {
  return [
    ...(input.attendanceRecords || []).map((item) => ({
      id: `attendance-${item.id}`,
      at: item.checkedInAt || item.createdAt,
      name: memberName(item.user),
      detail: `${item.status === 'NO_SHOW' ? 'No-show marked' : 'Attendance marked'} · ${item.occurrence.template.name}`,
      href: `/admin/schedule/${item.occurrence.id}`,
    })),
    ...(input.waitlistEntries || []).flatMap((item) => {
      const label = item.occurrence.template.isEvent ? 'Event' : 'Class';
      const items: AdminActivityItem[] = [
        {
          id: `waitlist-joined-${item.id}`,
          at: item.joinedAt,
          name: memberName(item.user),
          detail: `Waitlist joined · ${item.occurrence.template.name}`,
          href: `/admin/schedule/${item.occurrence.id}`,
        },
      ];
      if (item.promotedAt) {
        items.push({
          id: `waitlist-promoted-${item.id}`,
          at: item.promotedAt,
          name: memberName(item.user),
          detail: `${label} booked from waitlist · ${item.occurrence.template.name}`,
          href: `/admin/schedule/${item.occurrence.id}`,
        });
      }
      if (item.leftAt) {
        items.push({
          id: `waitlist-left-${item.id}`,
          at: item.leftAt,
          name: memberName(item.user),
          detail: `Waitlist left · ${item.occurrence.template.name}`,
          href: `/admin/schedule/${item.occurrence.id}`,
        });
      }
      return items;
    }),
    ...(input.bookings || []).flatMap((item) => {
      const label = item.occurrence.template.isEvent ? 'Event' : 'Class';
      const items: AdminActivityItem[] = [
        {
          id: `booking-${item.id}`,
          at: item.bookedAt,
          name: memberName(item.user),
          detail: `${label} booked · ${item.occurrence.template.name}`,
          href: `/admin/schedule/${item.occurrence.id}`,
        },
      ];
      if (item.cancelledAt) {
        items.push({
          id: `booking-cancelled-${item.id}`,
          at: item.cancelledAt,
          name: memberName(item.user),
          detail: `${label} ${item.status === 'LATE_CANCELLED' ? 'late-cancelled' : 'cancelled'} · ${item.occurrence.template.name}`,
          href: `/admin/schedule/${item.occurrence.id}`,
        });
      }
      return items;
    }),
    ...input.sombleTransactions.map((item) => ({
      id: `somble-sale-${item.id}`,
      at: item.transferredAt,
      name: memberName(item.user, item.supporterName),
      detail: `${item.contentType} · ${money(item.amountCents)} transferred from Somble`,
      href: '/admin/payments',
    })),
    ...(input.paymentRecords || [])
      .filter((item) => !item.purchaseId && !item.commerceOrderId)
      .map((item) => ({
        id: `stripe-payment-${item.id}`,
        at: item.occurredAt,
        name: memberName(item.user, item.customerName || item.customerEmail || 'Guest checkout'),
        detail: `Direct Stripe payment · ${titleCaseKind(item.kind)} · ${money(item.amountCents)} ${item.status.toLowerCase()}${item.refundedAmountCents > 0 ? ` · ${money(item.refundedAmountCents)} refunded` : ''}`,
        href: item.user ? `/admin/members/${item.user.id}` : '/admin/payments',
      })),
    ...input.commerceOrders.map((item) => ({
      id: `commerce-order-${item.id}`,
      at: item.paidAt || item.createdAt,
      name: memberName(item.user, item.customerEmail),
      detail: `${titleCaseKind(item.kind)} purchase · ${commerceOrderItemSummary(item.items)} · ${money(item.amountCents)} ${item.status.toLowerCase()}`,
      href: item.user ? `/admin/members/${item.user.id}` : '/admin/payments',
    })),
    ...input.memberships.map((item) => ({
      id: `membership-${item.id}`,
      at: item.currentPeriodStart || item.createdAt,
      name: memberName(item.user),
      detail: `Membership joined · ${item.product.name} · ${item.status}`,
      href: `/admin/members/${item.user.id}`,
    })),
    ...input.purchases.flatMap((item) =>
      (item.refunds || []).map((refund) => ({
        id: `refund-${refund.id}`,
        at: refund.createdAt,
        name: memberName(item.user),
        detail: `Refund issued · ${item.product.name} · ${money(refund.amountCents)} returned`,
        href: `/admin/members/${item.user.id}`,
      })),
    ),
    ...input.purchases.map((item) => {
      const netCents = Math.max(0, item.amountCents - item.refundedAmountCents);
      const refundDetail = item.refundedAmountCents > 0
        ? ` · net ${money(netCents)}`
        : '';
      return {
        id: `purchase-${item.id}`,
        at: item.paidAt || item.createdAt,
        name: memberName(item.user),
        detail: `${item.product.name} · ${money(item.amountCents)} ${item.status.toLowerCase()}${refundDetail}`,
        href: `/admin/members/${item.user.id}`,
      };
    }),
    ...input.sombleProfiles.map((item) => ({
      id: `somble-join-${item.id}`,
      at: item.sourceJoinedAt,
      name: memberName(item.user),
      detail: `Joined through Somble · ${item.sourceStatus}`,
      href: `/admin/members?q=${encodeURIComponent(item.user.email)}`,
    })),
    ...input.users.map((item) => ({
      id: `signup-${item.id}`,
      at: item.createdAt,
      name: memberName(item),
      detail: 'New Rhyze account created',
      href: `/admin/members/${item.id}`,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
}

type ClientMetricBooking = {
  status: string;
  occurrence: { status: string };
};

type ClientMetricMember = {
  createdAt: Date;
  lastLoginAt: Date | null;
  sombleClientProfile: {
    sourceJoinedAt: Date;
    lastLoginAt: Date | null;
    totalWorkouts: number;
  } | null;
  attendanceRecords?: Array<{ status: string; checkedInAt: Date | null }>;
  bookings?: ClientMetricBooking[];
  _count?: { bookings?: number };
};

export function clientDirectoryJoinedAt(member: ClientMetricMember) {
  return member.sombleClientProfile?.sourceJoinedAt || member.createdAt;
}

export function clientDirectoryLastLoginAt(member: ClientMetricMember) {
  return member.lastLoginAt || member.sombleClientProfile?.lastLoginAt || null;
}

export function clientDirectoryWorkoutCount(member: ClientMetricMember) {
  const sombleTotal = member.sombleClientProfile?.totalWorkouts || 0;
  const nativeAttended = member.attendanceRecords?.filter((record) =>
    attendanceStatusCountsAsAttended(record.status),
  ).length || 0;
  return sombleTotal + nativeAttended;
}

export function clientDirectoryBookedClassCount(member: Pick<ClientMetricMember, 'bookings'>) {
  return (member.bookings || []).filter(
    (booking) =>
      ['CONFIRMED', 'ATTENDED', 'NO_SHOW'].includes(booking.status) &&
      ['SCHEDULED', 'COMPLETED'].includes(booking.occurrence.status),
  ).length;
}
