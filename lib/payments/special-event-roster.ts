import type { AttendanceStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { isFinancialApprover } from '@/lib/auth/financial-owner-access';
import {
  rosterStaff,
  type RosterActor,
  type PaidGuestTicket,
} from './special-event-guests';
import { specialEventIdentity } from './black-friday-new-friend';

export type SpecialEventAttendee = {
  role: 'BUYER' | 'GUEST';
  fullName: string;
  phone: string | null;
  userId: string | null;
  bookingId: string | null;
  contribution: 'CASH_TICKET' | 'VIP_EVENT_CREDIT';
  waiver: 'ELECTRONIC' | 'PAPER' | 'NEEDED';
  attendanceStatus: AttendanceStatus | null;
  checkedInAt: Date | null;
  markedById: string | null;
};
export type SpecialEventGroup = {
  orderId: string;
  cashPaidCents: number;
  attendees: SpecialEventAttendee[];
};
export type SpecialEventReview = {
  orderId: string;
  management: 'SPECIAL_TICKET' | 'LEGACY_ORDER';
  buyerName: string;
  state: string;
  collectedCents: number;
  remainingCents: number;
  canRefund: boolean;
  canReconcile: boolean;
};
export type SpecialEventRoster = {
  groups: SpecialEventGroup[];
  linkedBookingIds: string[];
  reviewItems: SpecialEventReview[];
  currentWaiverVersionId: string | null;
  canLinkAccounts: boolean;
};

/** Snapshot includes historical signups. Admission continues to use the reservation-aware capacity guards. */
export async function paidEventDisplayCount(
  occurrenceId: string,
): Promise<number> {
  const [row] = await prisma.$queryRaw<
    { count: number }[]
  >`SELECT o."historicalSignupCount" +
    (SELECT count(*)::int FROM "Booking" b WHERE b."occurrenceId"=o.id AND b.status IN ('CONFIRMED','ATTENDED')
      AND NOT EXISTS (SELECT 1 FROM "BlackFridayTicket" t WHERE t."occurrenceId"=o.id AND b.id IN (t."buyerBookingId",t."guestBookingId"))) +
    (SELECT coalesce(sum(seats),0)::int FROM bf_paid_event_ticket t WHERE t."occurrenceId"=o.id) AS count
    FROM "ClassOccurrence" o WHERE o.id=${occurrenceId}`;
  return row?.count ?? 0;
}

export async function specialEventRoster(
  occurrenceId: string,
  actor: RosterActor,
): Promise<SpecialEventRoster> {
  return prisma.$transaction(
    async (tx) => {
      const { staff } = await rosterStaff(tx, occurrenceId, actor);
      const accounts = staff.role === 'OWNER' || staff.role === 'ADMIN';
      const empty: SpecialEventRoster = {
        groups: [],
        linkedBookingIds: [],
        reviewItems: [],
        currentWaiverVersionId: null,
        canLinkAccounts: accounts,
      };
      if (!specialEventIdentity(occurrenceId)) return empty;
      const [waiver] = await tx.$queryRaw<
        { id: string | null }[]
      >`SELECT bf_current_waiver() AS id`;
      const tickets = await tx.$queryRaw<
        (PaidGuestTicket & {
          settled: boolean;
          collected: number;
          remaining: number;
          pendingRefund: boolean;
        })[]
      >`
      SELECT t.*,paid."orderId" IS NOT NULL AS settled,coalesce(p."amountCents",0) AS collected,
       greatest(0,coalesce(p."amountCents"-greatest(p."refundedAmountCents",o."refundedAmountCents"),0)) AS remaining,
       EXISTS(SELECT 1 FROM "CommerceRefund" r WHERE r."commerceOrderId"=o.id AND r.status='PENDING') AS "pendingRefund"
      FROM "BlackFridayTicket" t JOIN "CommerceOrder" o ON o.id=t."orderId"
      LEFT JOIN bf_paid_event_ticket paid ON paid."orderId"=t."orderId"
      LEFT JOIN "PaymentRecord" p ON p."commerceOrderId"=o.id AND p."stripePaymentIntentId"=o."stripePaymentIntentId"
       AND p."stripeCheckoutSessionId"=o."stripeCheckoutSessionId" AND p."userId"=t."userId" AND p.kind='EVENT'
       AND p."amountCents"=o."amountCents" AND p.currency=o.currency AND p.status IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED','DISPUTED')
      WHERE t."occurrenceId"=${occurrenceId} ORDER BY o."createdAt",o.id`;
      const linkedBookingIds = tickets.flatMap((t) =>
        [t.buyerBookingId, t.guestBookingId].filter((id): id is string =>
          Boolean(id),
        ),
      );
      const signed = waiver.id
        ? await tx.waiverAcceptance.findMany({
            where: {
              waiverVersionId: waiver.id,
              userId: {
                in: tickets.flatMap((t) => [
                  t.userId,
                  ...(t.guestUserId ? [t.guestUserId] : []),
                ]),
              },
            },
            select: { userId: true },
          })
        : [];
      const signedIds = new Set(signed.map((s) => s.userId));
      const attendance = await tx.attendanceRecord.findMany({
        where: { bookingId: { in: linkedBookingIds } },
        select: {
          bookingId: true,
          status: true,
          checkedInAt: true,
          markedById: true,
        },
      });
      const byBooking = new Map(attendance.map((a) => [a.bookingId, a]));
      const groups: SpecialEventGroup[] = [];
      const reviewItems: SpecialEventReview[] = [];
      for (const t of tickets) {
        if (t.settled) {
          const roles: SpecialEventAttendee['role'][] =
            t.seats === 2 ? ['BUYER', 'GUEST'] : ['BUYER'];
          const attendees = roles.map((role): SpecialEventAttendee => {
            const guest = role === 'GUEST';
            const userId = guest ? t.guestUserId : t.userId;
            const bookingId = guest ? t.guestBookingId : t.buyerBookingId;
            const native = byBooking.get(bookingId);
            const unlinked = guest && !bookingId && Boolean(t.guestCheckedInAt);
            return {
              role,
              fullName: guest ? t.guestName! : t.buyerName,
              phone: guest ? t.guestPhone : null,
              userId,
              bookingId,
              contribution:
                !guest && t.creditAccountId
                  ? 'VIP_EVENT_CREDIT'
                  : 'CASH_TICKET',
              waiver:
                userId && signedIds.has(userId)
                  ? 'ELECTRONIC'
                  : guest && waiver.id && t.paperWaiverVersionId === waiver.id
                    ? 'PAPER'
                    : 'NEEDED',
              attendanceStatus:
                native?.status ?? (unlinked ? 'CHECKED_IN' : null),
              checkedInAt:
                native?.checkedInAt ?? (unlinked ? t.guestCheckedInAt : null),
              markedById:
                native?.markedById ?? (unlinked ? t.guestCheckedInById : null),
            };
          });
          groups.push({
            orderId: t.orderId,
            cashPaidCents: t.collected,
            attendees,
          });
        }
        if (accounts && !['REFUNDED', 'DISPUTE_LOST'].includes(t.state)) {
          reviewItems.push({
            orderId: t.orderId,
            management: 'SPECIAL_TICKET',
            buyerName: t.buyerName,
            state: t.state === 'PAID' && !t.settled ? 'REVIEW' : t.state,
            collectedCents: t.collected,
            remainingCents: t.remaining,
            canRefund:
              isFinancialApprover(staff) && t.remaining > 0 && !t.pendingRefund,
            canReconcile: t.state !== 'EXPIRED' || t.collected > 0,
          });
        }
      }
      if (accounts) {
        const legacy = await tx.$queryRaw<
          {
            orderId: string;
            buyerName: string;
            collected: number;
            remaining: number;
          }[]
        >`
        SELECT o.id AS "orderId",coalesce(o."customerName",u.name,'Attendee') AS "buyerName",
          coalesce(p."amountCents",0) AS collected,greatest(0,coalesce(p."amountCents"-greatest(p."refundedAmountCents",o."refundedAmountCents"),0)) AS remaining
        FROM "CommerceOrder" o LEFT JOIN "User" u ON u.id=o."userId"
        LEFT JOIN "PaymentRecord" p ON p."commerceOrderId"=o.id AND p."userId"=o."userId" AND p.kind='EVENT'
          AND p."stripePaymentIntentId"=o."stripePaymentIntentId" AND p."stripeCheckoutSessionId"=o."stripeCheckoutSessionId"
          AND p."amountCents"=o."amountCents" AND p.currency=o.currency AND p.status IN ('SUCCEEDED','PARTIALLY_REFUNDED')
        WHERE o.kind='EVENT' AND o."occurrenceId"=${occurrenceId} AND o.status='FULFILLMENT_REVIEW'
          AND NOT EXISTS (SELECT 1 FROM "BlackFridayTicket" t WHERE t."orderId"=o.id) ORDER BY o."createdAt",o.id`;
        for (const order of legacy)
          reviewItems.push({
            orderId: order.orderId,
            management: 'LEGACY_ORDER',
            buyerName: order.buyerName,
            state: 'FULFILLMENT_REVIEW',
            collectedCents: order.collected,
            remainingCents: order.remaining,
            canRefund: false,
            canReconcile: false,
          });
      }
      return {
        groups,
        linkedBookingIds,
        reviewItems,
        currentWaiverVersionId: waiver.id,
        canLinkAccounts: accounts,
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
