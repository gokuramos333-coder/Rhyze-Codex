import { Prisma, type PrismaClient } from '@prisma/client';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';
import { vipMembershipPaidThrough } from '@/lib/domain/credits/vip-access';
import { renewalFunding, vipRenewalEntitlementInclude, vipRenewalReservation, type RenewalMembership, type VipRenewalFunding } from './vip-renewal-reservation';
import { queueEmail } from '@/lib/notifications/email-queue';
import { occurrenceTitle } from '@/lib/domain/schedule/occurrence-management';
import { notifyWaitlistOpening } from './waitlist';

/** Actual booking ledger, not the historical policy tag, owns later debits.
 * Callers serialize with occurrence and entitlement locks. */
export async function renewalBookingSpend(tx: Prisma.TransactionClient, bookingId: string) {
  const entries = await tx.creditLedgerEntry.findMany({ where: { bookingId, type: { in: ['RESERVE', 'RELEASE', 'RESTORE'] } } });
  const balances = new Map<string, number>();
  for (const entry of entries) balances.set(entry.creditAccountId, (balances.get(entry.creditAccountId) ?? 0) + entry.quantity);
  return [...balances].filter(([, net]) => net < 0).map(([creditAccountId, net]) => ({ creditAccountId, quantity: -net }));
}
export async function releaseRenewalBookingSpend(tx: Prisma.TransactionClient, bookingId: string) {
  const spend = await renewalBookingSpend(tx, bookingId);
  for (const item of spend) await tx.creditLedgerEntry.create({ data: { ...item, bookingId, type: 'RELEASE', reason: 'Renewal reservation actual outstanding credit returned to original account' } });
  return spend.length > 0;
}
async function finiteBookingFunded(tx: Prisma.TransactionClient, bookingId: string, m: RenewalMembership | null, funding: VipRenewalFunding, startsAt: Date) {
  const account = m?.purchase?.creditAccount;
  const state = m?.planChangeState as { fundingReversedAt?: number } | null;
  if (!m || m.status !== 'ACTIVE' || m.purchase?.status !== 'PAID' || state?.fundingReversedAt ||
      !account || account.isUnlimited || account.id !== funding.creditAccountId ||
      account.validFrom > startsAt || !account.validUntil || account.validUntil <= startsAt ||
      !m.currentPeriodEnd || m.currentPeriodEnd <= startsAt ||
      m.freezes?.some(f => !f.cancelledAt && f.startAt <= startsAt && f.endAt > startsAt)) return false;
  return (await renewalBookingSpend(tx, bookingId)).some(s => s.creditAccountId === account.id && s.quantity === 1);
}

function paidForOccurrence(m: RenewalMembership | null, funding: VipRenewalFunding, startsAt: Date, now: Date) {
  if (!m || m.purchase?.creditAccount?.id !== funding.creditAccountId) return false;
  // Attendance may be marked after the class. Evaluate the paid service window
  // at class start, never extend coverage just because a subscription is ACTIVE.
  const at = new Date(Math.min(now.getTime(), startsAt.getTime()));
  const end = vipMembershipPaidThrough(m, at);
  return Boolean(end && startsAt < end && m.purchase.creditAccount.validFrom <= startsAt &&
    !m.freezes?.some(f => !f.cancelledAt && f.startAt <= startsAt && f.endAt > startsAt));
}

/** Fail closed at the attendance write, including delayed/missing webhook/jobs.
 * Caller owns occurrence -> entitlement locks, and re-reads the booking there. */
export async function assertVipRenewalAttendanceFunded(tx: Prisma.TransactionClient, booking: { id: string; policySnapshot: unknown; userId: string; status: string; occurrence: { startAt: Date } }, now = new Date()) {
  const funding = renewalFunding(booking.policySnapshot);
  if (!funding) return;
  const m = await tx.membership.findFirst({ where: { id: funding.membershipId, userId: booking.userId }, include: vipRenewalEntitlementInclude });
  if (['CANCELLED', 'LATE_CANCELLED'].includes(booking.status) || !(paidForOccurrence(m, funding, booking.occurrence.startAt, now) || await finiteBookingFunded(tx, booking.id, m, funding, booking.occurrence.startAt))) throw Error('renewal-unfunded');
}

/** Only opt-in reservations created by the new narrow action are candidates.
 * No historical inference, bulk customer cancellation, credit grant or refund.
 * Called after lifecycle commits; duplicate deliveries re-read current state. */
export async function reconcileVipRenewalBookings(db: PrismaClient, input: { userId?: string; now?: Date } = {}) {
  const now = input.now ?? new Date();
  const candidates = await db.booking.findMany({ where: {
    ...(input.userId ? { userId: input.userId } : {}), status: 'CONFIRMED',
    policySnapshot: { path: ['vipRenewalReservation', 'version'], equals: 1 },
    occurrence: { endAt: { gt: now } },
  }, select: { id: true, userId: true, occurrenceId: true }, orderBy: { id: 'asc' } });
  let removed = 0;
  for (const candidate of candidates) {
    removed += await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candidate.occurrenceId}))`;
      await lockMembershipEntitlements(tx, candidate.userId);
      const booking = await tx.booking.findUnique({ where: { id: candidate.id }, include: { user: true, occurrence: { include: { template: true } } } });
      if (!booking || booking.status !== 'CONFIRMED' || booking.occurrence.endAt <= now) return 0;
      // Transfers are intentionally not extended by this policy. If one moved
      // concurrently, retry on the next run under its actual occurrence lock.
      if (booking.occurrenceId !== candidate.occurrenceId) return 0;
      const funding = renewalFunding(booking.policySnapshot);
      if (!funding || booking.occurrence.template.isEvent) return 0;
      const m = await tx.membership.findFirst({ where: { id: funding.membershipId, userId: booking.userId }, include: vipRenewalEntitlementInclude });
      if (paidForOccurrence(m, funding, booking.occurrence.startAt, now) || await finiteBookingFunded(tx, booking.id, m, funding, booking.occurrence.startAt)) return 0;
      // Still before the original renewal and continuing under the same bounded
      // rule: keep the contingent seat. Once payment is due, unknown = unfunded.
      if (m && now < new Date(funding.paidThroughAtBooking) && vipRenewalReservation({
        account: { id: funding.creditAccountId, isUnlimited: true, sourcePurchase: { membership: { id: funding.membershipId } } },
        // Operation ownership blocks admission, but is not an authoritative cancellation.
        memberships: [{ ...m, billingLockToken: null, billingLockNeedsReview: false }], now, occurrenceStartsAt: booking.occurrence.startAt, isEvent: false,
      })) return 0;
      const creditReturned = await releaseRenewalBookingSpend(tx, booking.id);
      const snapshot = booking.policySnapshot as Prisma.JsonObject;
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED', cancelledAt: now, policySnapshot: {
        ...snapshot, vipRenewalRelease: { reason: 'RENEWAL_UNFUNDED', cancelledAt: now.toISOString() },
      } } });
      await tx.attendanceRecord.deleteMany({ where: { bookingId: booking.id } });
      await tx.emailMessage.updateMany({ where: { userId: booking.userId, template: { in: ['CLASS_REMINDER', 'BOOKING_CONFIRMATION'] }, status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] }, payload: { path: ['bookingId'], equals: booking.id } }, data: { status: 'CANCELLED' } });
      const dedupeKey = `vip-renewal-release:${booking.id}:${booking.bookedAt.toISOString()}`;
      const explanation = 'Your advance VIP reservation was released because renewal payment is not confirmed or continuing membership access has ended. ' + (creditReturned ? 'Outstanding credit was returned to its original account with its original expiry.' : 'No outstanding credit was returned.') + ' You can book again after access is restored, subject to availability. Separately paid bookings are unchanged.';
      await tx.inAppNotification.upsert({ where: { dedupeKey }, update: {}, create: { userId: booking.userId, title: 'VIP reservation released', body: explanation, link: '/member/bookings', dedupeKey } });
      await queueEmail(tx, { userId: booking.userId, to: booking.user.email, subject: `Reservation update: ${occurrenceTitle(booking.occurrence)}`, template: 'BOOKING_CANCELLATION', payload: { name: booking.user.name || 'Rhyzer', className: occurrenceTitle(booking.occurrence), classDate: booking.occurrence.startAt.toLocaleDateString('en-US', { timeZone: 'America/New_York' }), classTime: booking.occurrence.startAt.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }), creditResult: explanation, bookingsUrl: '/member/bookings' }, dedupeKey });
      await tx.auditLog.create({ data: { action: 'booking.vip-renewal-released', entityType: 'Booking', entityId: booking.id, before: { status: booking.status }, after: { membershipId: funding.membershipId, reason: 'RENEWAL_UNFUNDED' } } });
      await notifyWaitlistOpening(tx, booking.occurrenceId, dedupeKey, now);
      return 1;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
  }
  return { removed };
}

export async function reconcileVipRenewalStripeEvent(db: PrismaClient, event: { type: string; data: { object: unknown } }) {
  if (!['invoice.paid', 'invoice.payment_failed', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) return;
  const object = event.data.object as { id?: string; subscription?: string | { id: string }; parent?: { subscription_details?: { subscription?: string | { id: string } } } };
  const raw = event.type.startsWith('customer.subscription.') ? object.id : object.subscription ?? object.parent?.subscription_details?.subscription;
  const id = typeof raw === 'string' ? raw : raw?.id;
  if (!id) return;
  const m = await db.membership.findUnique({ where: { stripeSubscriptionId: id }, select: { userId: true } });
  if (m) return reconcileVipRenewalBookings(db, { userId: m.userId });
}
