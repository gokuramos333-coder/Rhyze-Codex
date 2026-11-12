'use server';
import { assertVipRenewalAttendanceFunded, releaseRenewalBookingSpend } from '@/lib/domain/bookings/vip-renewal-continuity';
import { renewalFunding } from '@/lib/domain/bookings/vip-renewal-reservation';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';
import { restoredCancellationAt } from '@/lib/domain/bookings/restored-cancellation-at';
import { notifyWaitlistOpening } from '@/lib/domain/bookings/waitlist';

import type { AttendanceStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActiveUser, requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import {
  eventCancellationCreditKey,
  eventCancellationCreditLabel,
  eventCancellationCreditTerms,
} from '@/lib/domain/bookings/cancellation-credit';
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
import { assertNoCashRefundForBooking } from '@/lib/domain/bookings/cash-refund-guard';

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
      // Studio cancellation takes occurrence/booking rows before notification
      // FKs reach the member row. Take the occurrence row before entitlements
      // but after the booking advisory lock used first by legacy payment writers.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${occurrenceId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bookingId}))`;
      await tx.$queryRaw`SELECT id FROM "ClassOccurrence" WHERE id = ${occurrenceId} FOR UPDATE`;
      await lockMembershipEntitlements(tx, booking.userId);
      if (renewalFunding(booking.policySnapshot)) {
        const current = await tx.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { occurrence: true } });
        if (current.occurrenceId !== occurrenceId) throw Error('renewal-unfunded');
        await assertVipRenewalAttendanceFunded(tx, current);
      }
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
            booking.cancelledAt ?? (transition.attendanceStatus === 'LATE_CANCELLED' ? new Date() : null),
        },
      });
      if (booking.status === 'CONFIRMED' && transition.bookingStatus === 'LATE_CANCELLED') {
        await notifyWaitlistOpening(tx, occurrenceId, booking.id);
      }
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
  const restored = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${occurrenceId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bookingId}))`;
    await tx.$queryRaw`SELECT id FROM "ClassOccurrence" WHERE id = ${occurrenceId} FOR UPDATE`;
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, occurrenceId },
      select: {
        id: true,
        occurrenceId: true,
        userId: true,
        cancelledAt: true,
        status: true,
        policySnapshot: true,
        user: { select: { name: true, email: true } },
        occurrence: { select: { startAt: true, timezone: true, template: { select: { name: true, isEvent: true } } } },
      },
    });
    if (!booking) return null;
    await lockMembershipEntitlements(tx, booking.userId);
    // The cancellation receipt binds preserved history even if a later roster
    // edit changes its snapshot. Never mint a fallback credit from that history.
    if (await tx.auditLog.findFirst({ where: {
      action: 'membership.intro_trial_cancelled', entityType: 'Membership',
      after: { path: ['preservedBookingIds'], array_contains: [booking.id] },
    }, select: { id: true } })) throw Error('Cancelled trial credit restoration needs review.');
    if (renewalFunding(booking.policySnapshot)) {
      // A later paid conversion may have reserved real inventory.
      const creditReturned = await releaseRenewalBookingSpend(tx, booking.id);
      if (booking.status !== 'CANCELLED') {
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
        await tx.attendanceRecord.deleteMany({ where: { bookingId } });
        await tx.emailMessage.updateMany({ where: { userId: booking.userId, template: { in: ['CLASS_REMINDER', 'BOOKING_CONFIRMATION'] }, status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] }, payload: { path: ['bookingId'], equals: bookingId } }, data: { status: 'CANCELLED' } });
        await tx.auditLog.create({ data: { actorId: actor.id, action: 'booking.vip-renewal-admin-cancelled', entityType: 'Booking', entityId: booking.id, after: { creditReturned } } });
        await notifyWaitlistOpening(tx, occurrenceId, `vip-renewal-admin-cancel:${booking.id}`);
      }
      return { booking, fallbackUsed: false, noCreditSpent: !creditReturned };
    }
    await assertNoCashRefundForBooking(tx, booking);

    const reservation = await tx.creditLedgerEntry.findFirst({
      where: { bookingId, type: 'RESERVE' },
    });
    // no-reservation fallback: imported/Somble/admin-created bookings may not have a RESERVE ledger entry.
    const restoredKey = `attendance-restore:${bookingId}`;
    const eventRestoredKey = eventCancellationCreditKey(bookingId);
    const restoredAt = new Date();
    const existingEventRestore = await tx.creditLedgerEntry.findUnique({
      where: { sourceReturnKey: eventRestoredKey },
    });
    const existingClassRestore = await tx.creditLedgerEntry.findUnique({
      where: { sourceReturnKey: restoredKey },
    });
    if (booking.occurrence.template.isEvent && existingClassRestore && !existingEventRestore) {
      const terms = eventCancellationCreditTerms(restoredAt);
      await tx.creditAccount.update({
        where: { id: existingClassRestore.creditAccountId },
        data: {
          label: eventCancellationCreditLabel(booking.occurrence.template.name),
          validFrom: terms.validFrom,
          validUntil: terms.validUntil,
        },
      });
      await tx.creditLedgerEntry.update({
        where: { id: existingClassRestore.id },
        data: {
          sourceReturnKey: eventRestoredKey,
          type: 'GRANT',
          quantity: terms.quantity,
          reason: `Manual event cancellation credit restore by ${actor.email}`,
        },
      });
    } else if (!existingEventRestore && !existingClassRestore) {
      if (reservation) {
        await tx.creditLedgerEntry.create({
          data: {
            creditAccountId: reservation.creditAccountId,
            bookingId,
            sourceReturnKey: restoredKey,
            type: 'RELEASE',
            quantity: 1,
            reason: `Manual attendance credit release by ${actor.email}`,
          },
        });
      } else {
        const terms = booking.occurrence.template.isEvent
          ? eventCancellationCreditTerms(restoredAt)
          : returnedCreditTerms(restoredAt);
        const creditAccount = await tx.creditAccount.create({
          data: {
            userId: booking.userId,
            label: booking.occurrence.template.isEvent
              ? eventCancellationCreditLabel(booking.occurrence.template.name)
              : 'Class credit — Manual rollover credit',
            validFrom: terms.validFrom,
            validUntil: terms.validUntil,
          },
        });
        await tx.creditLedgerEntry.create({
          data: {
            creditAccountId: creditAccount.id,
            bookingId,
            sourceReturnKey: booking.occurrence.template.isEvent
              ? eventRestoredKey
              : restoredKey,
            type: booking.occurrence.template.isEvent ? 'GRANT' : 'RESTORE',
            quantity: terms.quantity,
            reason: booking.occurrence.template.isEvent
              ? `Manual event cancellation credit restore by ${actor.email}`
              : `Manual attendance class credit restore by ${actor.email} (no original credit reservation)`,
          },
        });
      }
    }

    const cancelledAt = restoredCancellationAt(booking.cancelledAt, restoredAt, existingEventRestore);
    if (cancelledAt.getTime() !== booking.cancelledAt?.getTime()) {
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'booking.cancellation-history-restored',
          entityType: 'Booking',
          entityId: booking.id,
          before: { cancelledAt: booking.cancelledAt?.toISOString() ?? null },
          after: { cancelledAt: cancelledAt.toISOString(), sourceReturnKey: existingEventRestore?.sourceReturnKey ?? null },
        },
      });
    }
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelledAt },
    });
    await tx.attendanceRecord.deleteMany({
      where: { bookingId: booking.id },
    });
    await tx.emailMessage.updateMany({
      where: {
        dedupeKey: `class-reminder:${booking.id}:${booking.occurrenceId}`,
        template: 'CLASS_REMINDER',
        status: { in: ['QUEUED', 'PROCESSING'] },
      },
      data: { status: 'CANCELLED' },
    });

    return { booking, fallbackUsed: !reservation };
  });
  if (!restored) return;
  const { booking, fallbackUsed } = restored;
  if ('noCreditSpent' in restored && restored.noCreditSpent) {
    revalidatePath(`/admin/schedule/${occurrenceId}/roster`);
    revalidatePath('/member/bookings');
    redirect(`/admin/schedule/${occurrenceId}/roster?result=cancelled-no-credit-spent`);
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
      fallbackUsed,
    },
  });
  revalidatePath(`/admin/schedule/${occurrenceId}/roster`);
  revalidatePath(`/admin/members/${booking.userId}`);
  revalidatePath('/member/bookings');
  redirect(`/admin/members/${booking.userId}?sent=attendance-credit-restored#credits`);
}
