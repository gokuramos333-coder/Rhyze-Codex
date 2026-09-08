'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { evaluateTransferWindow } from '@/lib/domain/transfers/transfer-policy';
import { queueEmail } from '@/lib/notifications/email-queue';
import { evaluateIntroTrialBooking } from '@/lib/domain/bookings/intro-trial-rules';
import { bookingAccessType, bookingPolicySnapshotWithAccess } from '@/lib/domain/bookings/booking-access';
import { chargeAttendanceFee, refundAttendanceFee } from '@/lib/payments/attendance-fee';

export async function transferBookingAction(formData: FormData) {
  const instructor = await requireArea('instructor');
  const bookingId = String(formData.get('bookingId') || '');
  const destinationId = String(formData.get('destinationId') || '');
  const reason = String(formData.get('reason') || '').trim() || null;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
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
  if (!booking || booking.status !== 'CONFIRMED' || booking.occurrence.instructorId !== instructor.id) {
    redirect(`/instructor/classes/${formData.get('occurrenceId')}/roster`);
  }
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
  if (policy === 'BLOCKED') {
    await prisma.$transaction([
      prisma.booking.update({ where: { id: booking.id }, data: { status: 'LATE_CANCELLED', cancelledAt: new Date() } }),
      prisma.bookingTransfer.create({ data: { bookingId, memberId: booking.userId, instructorId: instructor.id, fromOccurrenceId: booking.occurrenceId, status: 'BLOCKED', reason } }),
    ]);
    redirect(`/instructor/classes/${booking.occurrenceId}/roster?transfer=blocked`);
  }
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
  });
  if (!requestedDestination) {
    redirect(`/instructor/classes/${booking.occurrenceId}/transfers?booking=${booking.id}&error=destination`);
  }
  const [requestedOccupied, requestedOverlap] = await Promise.all([
    prisma.booking.count({ where: { occurrenceId: destinationId, status: 'CONFIRMED' } }),
    prisma.booking.findFirst({
      where: {
        userId: booking.userId,
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
    redirect(`/instructor/classes/${booking.occurrenceId}/transfers?booking=${booking.id}&error=destination`);
  }
  const feeResult = feeCents > 0
    ? await chargeAttendanceFee({
        bookingId,
        userId: booking.userId,
        stripeCustomerId: booking.user.stripeCustomerId,
        feeType: 'TRANSFER',
        amountCents: feeCents,
        idempotencyKey: `transfer-fee-${booking.id}-${booking.occurrenceId}-${destinationId}`,
      })
    : null;
  if (feeResult?.status === 'FAILED') {
    await prisma.bookingTransfer.create({
      data: {
        bookingId,
        memberId: booking.userId,
        instructorId: instructor.id,
        fromOccurrenceId: booking.occurrenceId,
        toOccurrenceId: destinationId,
        status: 'PAYMENT_FAILED',
        feeCents,
        reason,
      },
    });
    redirect(`/instructor/classes/${booking.occurrenceId}/transfers?booking=${booking.id}&error=payment`);
  }
  const paymentIntentId = feeResult?.status === 'SUCCEEDED'
    ? feeResult.paymentIntentId
    : undefined;
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${destinationId}))`;
    const destination = await tx.classOccurrence.findFirst({
      where: { id: destinationId, status: 'SCHEDULED' },
      include: { template: true },
    });
    if (!destination || destination.startAt > new Date(booking.occurrence.startAt.getTime() + 14 * 24 * 60 * 60_000) || destination.startAt < new Date()) return false;
    const occupied = await tx.booking.count({ where: { occurrenceId: destinationId, status: 'CONFIRMED' } });
    if (occupied + destination.historicalSignupCount >= destination.capacity) return false;
    const trial = await tx.membership.findFirst({
      where: { userId: booking.userId, status: { in: ['TRIALING', 'ACTIVE'] }, product: { kind: 'INTRO_TRIAL' } },
      orderBy: { createdAt: 'desc' },
    });
    if (trial) {
      const alternateAccess = await tx.membership.findFirst({
        where: { userId: booking.userId, status: 'ACTIVE', product: { kind: { not: 'INTRO_TRIAL' } } },
        select: { id: true },
      });
      const trialAccess = evaluateIntroTrialBooking({
        activatedAt: trial.activatedAt,
        occurrenceStartsAt: destination.startAt,
        now: new Date(),
        isEvent: destination.template.isEvent,
      });
      if (!trialAccess.allowed && !alternateAccess) return false;
    }
    const overlap = await tx.booking.findFirst({ where: { userId: booking.userId, id: { not: booking.id }, status: 'CONFIRMED', occurrence: { startAt: { lt: destination.endAt }, endAt: { gt: destination.startAt } } } });
    if (overlap) return false;
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        occurrenceId: destinationId,
        policySnapshot: {
          ...bookingPolicySnapshotWithAccess({
            currentSnapshot: booking.policySnapshot,
            accessType,
            accessProductKind: reservedProductKind,
          }),
          transferredFrom: booking.occurrenceId,
          transferredAt: new Date().toISOString(),
          transferRequestedBy: 'INSTRUCTOR',
        },
      },
    });
    await tx.bookingTransfer.create({
      data: {
        bookingId,
        memberId: booking.userId,
        instructorId: instructor.id,
        fromOccurrenceId: booking.occurrenceId,
        toOccurrenceId: destinationId,
        status: 'COMPLETED',
        feeCents,
        stripePaymentIntentId: paymentIntentId,
        reason,
      },
    });
    await queueEmail(tx, {
      userId: booking.userId,
      to: booking.user.email,
      subject: 'Your Rhyze class transfer is confirmed',
      template: 'BOOKING_TRANSFERRED',
      payload: {
        name: booking.user.name || 'Rhyzer',
        previousClass: `${booking.occurrence.template.name} · ${booking.occurrence.startAt.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })}`,
        newClass: `${destination.template.name} · ${destination.startAt.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })}`,
        bookingsUrl: '/member/bookings',
      },
      dedupeKey: `booking-transfer:${booking.id}:${destination.id}`,
    });
    return true;
  });
  if (!outcome) {
    if (paymentIntentId) {
      await refundAttendanceFee({
        paymentIntentId,
        amountCents: feeCents,
        idempotencyKey: `refund-transfer-fee-${booking.id}-${booking.occurrenceId}-${destinationId}`,
      });
    }
    redirect(`/instructor/classes/${booking.occurrenceId}/transfers?booking=${booking.id}&error=destination`);
  }
  revalidatePath(`/instructor/classes/${booking.occurrenceId}/roster`);
  redirect(`/instructor/classes/${destinationId}/roster?transfer=complete`);
}
