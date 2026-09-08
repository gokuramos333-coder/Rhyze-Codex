'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { evaluateTransferWindow } from '@/lib/domain/transfers/transfer-policy';
import { queueEmail } from '@/lib/notifications/email-queue';
import { bookingAccessType, bookingPolicySnapshotWithAccess } from '@/lib/domain/bookings/booking-access';
import { chargeAttendanceFee, refundAttendanceFee } from '@/lib/payments/attendance-fee';

export async function rescheduleMemberBookingAction(formData: FormData) {
  const user = await requireArea('member');
  const bookingId = String(formData.get('bookingId') || '');
  const destinationId = String(formData.get('destinationId') || '');
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId: user.id, status: 'CONFIRMED' },
    include: {
      user: {
        include: {
          memberships: {
            where: { status: { in: ['ACTIVE', 'TRIALING'] } },
            select: { product: { select: { kind: true } } },
          },
        },
      },
      occurrence: { include: { template: true } },
    },
  });
  if (!booking) redirect('/member/bookings');

  const reservation = await prisma.creditLedgerEntry.findFirst({
    where: { bookingId: booking.id, type: 'RESERVE' },
    include: {
      creditAccount: {
        include: {
          sourcePurchase: { select: { product: { select: { kind: true } } } },
        },
      },
    },
  });
  const reservedProductKind = reservation?.creditAccount.sourcePurchase?.product.kind ?? null;
  const accessType = bookingAccessType({
    policySnapshot: booking.policySnapshot,
    bookingSource: booking.source,
    reservedProductKind,
    activeProductKinds: booking.user.memberships.map(
      (membership) => membership.product.kind,
    ),
  });
  const policy = evaluateTransferWindow(booking.occurrence.startAt, new Date(), accessType);
  if (policy === 'BLOCKED') redirect('/member/bookings?result=reschedule-blocked');

  const feeCents = policy === 'FEE_500' ? 500 : 0;

  const requestedDestination = await prisma.classOccurrence.findFirst({
    where: {
      id: destinationId,
      status: 'SCHEDULED',
      startAt: {
        gte: new Date(),
        lte: new Date(booking.occurrence.startAt.getTime() + 14 * 24 * 60 * 60_000),
      },
    },
    include: { template: true },
  });
  if (!requestedDestination) redirect('/member/bookings?result=reschedule-destination');
  const [requestedOccupied, requestedOverlap] = await Promise.all([
    prisma.booking.count({ where: { occurrenceId: destinationId, status: 'CONFIRMED' } }),
    prisma.booking.findFirst({
      where: {
        userId: user.id,
        id: { not: booking.id },
        status: 'CONFIRMED',
        occurrence: {
          startAt: { lt: requestedDestination.endAt },
          endAt: { gt: requestedDestination.startAt },
        },
      },
      select: { id: true },
    }),
  ]);
  if (
    requestedOverlap ||
    requestedOccupied + requestedDestination.historicalSignupCount >= requestedDestination.capacity
  ) {
    redirect('/member/bookings?result=reschedule-destination');
  }

  const feeResult = feeCents > 0
    ? await chargeAttendanceFee({
        bookingId,
        userId: user.id,
        stripeCustomerId: booking.user.stripeCustomerId,
        feeType: 'TRANSFER',
        amountCents: feeCents,
        idempotencyKey: `member-transfer-fee-${booking.id}-${booking.occurrenceId}-${destinationId}`,
      })
    : null;
  if (feeResult?.status === 'FAILED') {
    redirect('/member/bookings?result=reschedule-payment');
  }
  const paymentIntentId = feeResult?.status === 'SUCCEEDED'
    ? feeResult.paymentIntentId
    : undefined;

  const moved = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${destinationId}))`;
    const destination = await tx.classOccurrence.findFirst({
      where: {
        id: destinationId,
        status: 'SCHEDULED',
        startAt: {
          gte: new Date(),
          lte: new Date(booking.occurrence.startAt.getTime() + 14 * 24 * 60 * 60_000),
        },
      },
      include: { template: true },
    });
    if (!destination) return false;
    const occupied = await tx.booking.count({ where: { occurrenceId: destinationId, status: 'CONFIRMED' } });
    if (occupied + destination.historicalSignupCount >= destination.capacity) return false;
    const overlap = await tx.booking.findFirst({
      where: {
        userId: user.id,
        id: { not: booking.id },
        status: 'CONFIRMED',
        occurrence: { startAt: { lt: destination.endAt }, endAt: { gt: destination.startAt } },
      },
    });
    if (overlap) return false;

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        occurrenceId: destination.id,
        policySnapshot: {
          ...bookingPolicySnapshotWithAccess({
            currentSnapshot: booking.policySnapshot,
            accessType,
            accessProductKind: reservedProductKind,
          }),
          transferredFrom: booking.occurrenceId,
          transferredAt: new Date().toISOString(),
          transferRequestedBy: 'MEMBER',
        },
      },
    });
    await tx.bookingTransfer.create({
      data: {
        bookingId,
        memberId: user.id,
        instructorId: booking.occurrence.instructorId || user.id,
        fromOccurrenceId: booking.occurrenceId,
        toOccurrenceId: destination.id,
        status: 'COMPLETED',
        feeCents,
        stripePaymentIntentId: paymentIntentId,
        reason: 'Member self-reschedule',
      },
    });
    await queueEmail(tx, {
      userId: user.id,
      to: user.email,
      subject: 'Your Rhyze class was rescheduled',
      template: 'BOOKING_TRANSFERRED',
      payload: {
        name: user.name || 'Rhyzer',
        previousClass: `${booking.occurrence.template.name} · ${booking.occurrence.startAt.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })}`,
        newClass: `${destination.template.name} · ${destination.startAt.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })}`,
        bookingsUrl: '/member/bookings',
      },
      dedupeKey: `member-booking-transfer:${booking.id}:${destination.id}`,
    });
    return true;
  });

  if (!moved) {
    if (paymentIntentId) {
      await refundAttendanceFee({
        paymentIntentId,
        amountCents: feeCents,
        idempotencyKey: `refund-member-transfer-fee-${booking.id}-${booking.occurrenceId}-${destinationId}`,
      });
    }
    redirect('/member/bookings?result=reschedule-destination');
  }
  revalidatePath('/member/bookings');
  revalidatePath('/schedule');
  redirect('/member/bookings?result=rescheduled');
}
