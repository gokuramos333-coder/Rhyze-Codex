'use server';

import type { AttendanceStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActiveUser, requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { returnedCreditTerms } from '@/lib/domain/credits/returned-credit';
import { queueEmail } from '@/lib/notifications/email-queue';
import { chargeAttendanceFee, refundAttendanceFee } from '@/lib/payments/attendance-fee';
import {
  attendanceToggle,
  type InstructorAttendanceStatus,
} from '@/lib/domain/bookings/attendance-toggle';
import { noShowFeeDecision } from '@/lib/domain/bookings/booking-rules';
import { bookingAccessType } from '@/lib/domain/bookings/booking-access';
import { hasPermission } from '@/lib/auth/permissions';

const validStatuses = new Set<AttendanceStatus>([
  'CHECKED_IN',
  'NO_SHOW',
  'LATE_CANCELLED',
]);

function attendanceRosterPath(actorRole: string, occurrenceId: string, result: string) {
  const basePath = actorRole === 'INSTRUCTOR'
    ? `/instructor/classes/${occurrenceId}/roster`
    : `/admin/schedule/${occurrenceId}/roster`;
  return `${basePath}?result=${result}`;
}

export async function markAttendanceAction(formData: FormData): Promise<void> {
  const actor = await requireActiveUser();
  if (!hasPermission(actor.role, 'roster:manage-assigned')) return;
  const occurrenceId = String(formData.get('occurrenceId') || '');
  const bookingId = String(formData.get('bookingId') || '');
  const status = String(formData.get('status') || '') as InstructorAttendanceStatus;
  if (!validStatuses.has(status)) return;

  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: occurrenceId },
    select: { instructorId: true },
  });
  if (!occurrence || (actor.role === 'INSTRUCTOR' && occurrence.instructorId !== actor.id)) {
    return;
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, occurrenceId },
    include: {
      attendance: true,
      occurrence: { include: { template: true } },
      user: {
        select: {
          email: true,
          name: true,
          stripeCustomerId: true,
          memberships: {
            where: { status: { in: ['ACTIVE', 'TRIALING'] } },
            include: { product: { select: { kind: true, trialDays: true, priceCents: true } } },
          },
        },
      },
    },
  });
  if (!booking) return;

  const transition = attendanceToggle(booking.attendance?.status || null, status);
  let noShowFee: ReturnType<typeof noShowFeeDecision> | null = null;
  let noShowFeeResult: Awaited<ReturnType<typeof chargeAttendanceFee>> | null = null;
  if (status === 'NO_SHOW' && transition.action !== 'CLEAR') {
    const [previousNoShowCount, reservation] = await Promise.all([
      prisma.attendanceRecord.count({
        where: {
          userId: booking.userId,
          status: 'NO_SHOW',
          bookingId: { not: booking.id },
        },
      }),
      prisma.creditLedgerEntry.findFirst({
        where: { bookingId: booking.id, type: 'RESERVE' },
        include: {
          creditAccount: {
            include: {
              sourcePurchase: {
                select: { product: { select: { kind: true } } },
              },
            },
          },
        },
      }),
    ]);
    const accessType = bookingAccessType({
      policySnapshot: booking.policySnapshot,
      bookingSource: booking.source,
      reservedProductKind:
        reservation?.creditAccount.sourcePurchase?.product.kind ?? null,
      activeProductKinds: booking.user.memberships.map(
        (membership) => membership.product.kind,
      ),
    });
    noShowFee = noShowFeeDecision({
      activeMemberships: booking.user.memberships,
      previousNoShowCount,
      bookingSource: booking.source,
      accessType,
    });
    if (noShowFee.amountCents > 0) {
      noShowFeeResult = await chargeAttendanceFee({
        bookingId: booking.id,
        userId: booking.userId,
        stripeCustomerId: booking.user.stripeCustomerId,
        feeType: 'NO_SHOW',
        amountCents: noShowFee.amountCents,
        idempotencyKey: `no-show-fee-${booking.id}`,
      });
    }
  }

  if (
    booking.attendance?.status === 'NO_SHOW' &&
    (transition.action === 'CLEAR' || status !== 'NO_SHOW')
  ) {
    const chargedNoShow = await prisma.paymentRecord.findFirst({
      where: {
        bookingId: booking.id,
        kind: 'NO_SHOW_FEE',
        status: 'SUCCEEDED',
        stripePaymentIntentId: { not: null },
      },
      orderBy: { occurredAt: 'desc' },
    });
    if (chargedNoShow?.stripePaymentIntentId) {
      await refundAttendanceFee({
        paymentIntentId: chargedNoShow.stripePaymentIntentId,
        amountCents: chargedNoShow.amountCents,
        idempotencyKey: `refund-no-show-fee-${booking.id}`,
      });
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (transition.action === 'CLEAR') {
        await tx.attendanceRecord.deleteMany({
          where: { occurrenceId, userId: booking.userId },
        });
      } else {
        await tx.attendanceRecord.upsert({
          where: { occurrenceId_userId: { occurrenceId, userId: booking.userId } },
          update: {
            status,
            markedById: actor.id,
            checkedInAt: status === 'CHECKED_IN' ? new Date() : null,
          },
          create: {
            occurrenceId,
            bookingId,
            userId: booking.userId,
            status,
            markedById: actor.id,
            checkedInAt: status === 'CHECKED_IN' ? new Date() : null,
          },
        });
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: transition.bookingStatus,
          cancelledAt:
            transition.attendanceStatus === 'LATE_CANCELLED' ? new Date() : null,
        },
      });
    });
  } catch (error) {
    if (noShowFeeResult?.status === 'SUCCEEDED' && noShowFee) {
      await refundAttendanceFee({
        paymentIntentId: noShowFeeResult.paymentIntentId,
        amountCents: noShowFee.amountCents,
        idempotencyKey: `refund-no-show-fee-failed-attendance-${booking.id}`,
      }).catch((refundError) => {
        console.error('No-show fee compensation refund failed', {
          bookingId: booking.id,
          paymentIntentId: noShowFeeResult.paymentIntentId,
          message: refundError instanceof Error ? refundError.message : 'Unknown refund error',
        });
      });
    }
    throw error;
  }

  if (status === 'NO_SHOW' && transition.action !== 'CLEAR') {
    await queueEmail(prisma, {
      userId: booking.userId,
      to: booking.user.email,
      subject: `We missed you at ${booking.occurrence.template.name}`,
      template: 'ATTENDANCE_NO_SHOW',
      dedupeKey: `attendance-no-show:${booking.id}`,
      payload: {
        name: booking.user.name || 'Rhyzer',
        className: booking.occurrence.template.name,
        classDate: booking.occurrence.startAt.toLocaleDateString('en-US', {
          timeZone: booking.occurrence.timezone,
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        }),
        classTime: booking.occurrence.startAt.toLocaleTimeString('en-US', {
          timeZone: booking.occurrence.timezone,
          hour: 'numeric',
          minute: '2-digit',
        }),
        chargeSummary: noShowFee?.amountCents
          ? noShowFeeResult?.status === 'SUCCEEDED'
            ? `$${(noShowFee.amountCents / 100).toFixed(0)} no-show fee charged to your saved payment method.`
            : `$${(noShowFee.amountCents / 100).toFixed(0)} no-show fee could not be charged. Please update your saved payment method or contact the studio.`
          : 'No fee was charged for this no-show.',
        policyUrl: '/policies#cancellation',
        bookingsUrl: '/member/bookings',
      },
    });
  }

  revalidatePath(`/instructor/classes/${occurrenceId}/roster`);
  revalidatePath(`/admin/schedule/${occurrenceId}/roster`);
  redirect(attendanceRosterPath(
    actor.role,
    occurrenceId,
    transition.action === 'CLEAR' ? 'attendance-cleared' : `attendance-${status.toLowerCase()}`,
  ));
}

export async function restoreCreditAction(formData: FormData): Promise<void> {
  const actor = await requireArea('admin');
  const occurrenceId = String(formData.get('occurrenceId') || '');
  const bookingId = String(formData.get('bookingId') || '');
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, occurrenceId },
    select: {
      id: true,
      userId: true,
      user: { select: { name: true, email: true } },
      occurrence: { select: { startAt: true, timezone: true, template: { select: { name: true } } } },
    },
  });
  if (!booking) return;
  const reservation = await prisma.creditLedgerEntry.findFirst({
    where: { bookingId, type: 'RESERVE' },
  });
  // no-reservation fallback: imported/Somble/admin-created bookings may not have a RESERVE ledger entry.
  const restoredKey = `attendance-restore:${bookingId}`;
  const alreadyRestored = await prisma.creditLedgerEntry.findFirst({
    where: { sourceReturnKey: restoredKey },
  });
  if (!alreadyRestored) {
    const terms = returnedCreditTerms(new Date());
    const creditAccount = await prisma.creditAccount.create({
      data: {
        userId: booking.userId,
        label: 'Manual rollover credit',
        validFrom: terms.validFrom,
        validUntil: terms.validUntil,
      },
    });
    await prisma.creditLedgerEntry.create({
      data: {
        creditAccountId: creditAccount.id,
        bookingId,
        sourceReturnKey: restoredKey,
        type: 'RESTORE',
        quantity: terms.quantity,
        reason: reservation
          ? `Manual attendance credit restore by ${actor.email}`
          : `Manual attendance credit restore by ${actor.email} (no original credit reservation)`,
      },
    });
  }
  await queueEmail(prisma, {
    userId: booking.userId,
    to: 'melissa@rhyzefit.com',
    cc: ['vanessa@rhyzefit.com'],
    subject: `Credit restored: ${booking.user.name || booking.user.email}`,
    template: 'ATTENDANCE_CREDIT_RESTORED_STAFF',
    dedupeKey: `attendance-credit-restored:${bookingId}`,
    payload: {
      memberName: booking.user.name || booking.user.email,
      memberEmail: booking.user.email,
      className: booking.occurrence.template.name,
      classDate: booking.occurrence.startAt.toLocaleDateString('en-US', {
        timeZone: booking.occurrence.timezone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
      classTime: booking.occurrence.startAt.toLocaleTimeString('en-US', {
        timeZone: booking.occurrence.timezone,
        hour: 'numeric',
        minute: '2-digit',
      }),
      adminUrl: `/admin/members/${booking.userId}#credits`,
      restoredBy: actor.email,
      fallbackUsed: !reservation,
    },
  });
  revalidatePath(`/admin/schedule/${occurrenceId}/roster`);
  revalidatePath(`/admin/members/${booking.userId}`);
  redirect(`/admin/members/${booking.userId}?sent=attendance-credit-restored#credits`);
}
