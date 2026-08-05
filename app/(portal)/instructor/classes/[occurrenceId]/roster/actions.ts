'use server';

import type { AttendanceStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActiveUser, requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { returnedCreditTerms } from '@/lib/domain/credits/returned-credit';
import { queueEmail } from '@/lib/notifications/email-queue';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import {
  attendanceToggle,
  type InstructorAttendanceStatus,
} from '@/lib/domain/bookings/attendance-toggle';
import { noShowFeeDecision } from '@/lib/domain/bookings/booking-rules';
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

async function chargeNoShowFee(input: {
  bookingId: string;
  userId: string;
  stripeCustomerId: string | null;
  amountCents: number;
}) {
  if (input.amountCents <= 0 || !stripeIsConfigured() || !input.stripeCustomerId) return null;
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(input.stripeCustomerId);
  if (customer.deleted || !customer.invoice_settings.default_payment_method) return null;
  const paymentMethod =
    typeof customer.invoice_settings.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings.default_payment_method.id;
  const payment = await stripe.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: 'usd',
      customer: input.stripeCustomerId,
      payment_method: paymentMethod,
      confirm: true,
      off_session: true,
      description: 'Rhyze no-show fee',
      metadata: { bookingId: input.bookingId, feeType: 'NO_SHOW', amountCents: String(input.amountCents) },
    },
    { idempotencyKey: `no-show-fee-${input.bookingId}` },
  );
  await prisma.paymentRecord.upsert({
    where: { stripeEventId: `no-show-fee:${payment.id}` },
    update: {},
    create: {
      userId: input.userId,
      kind: 'TRANSFER_FEE',
      status: 'SUCCEEDED',
      amountCents: input.amountCents,
      stripeEventId: `no-show-fee:${payment.id}`,
      stripeCustomerId: input.stripeCustomerId,
      stripePaymentIntentId: payment.id,
      occurredAt: new Date(),
    },
  });
  return payment.id;
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
  let noShowPaymentIntentId: string | null = null;
  if (status === 'NO_SHOW' && transition.action !== 'CLEAR') {
    const previousNoShowCount = await prisma.attendanceRecord.count({
      where: {
        userId: booking.userId,
        status: 'NO_SHOW',
        bookingId: { not: booking.id },
      },
    });
    noShowFee = noShowFeeDecision({
      activeMemberships: booking.user.memberships,
      previousNoShowCount,
    });
    noShowPaymentIntentId = await chargeNoShowFee({
      bookingId: booking.id,
      userId: booking.userId,
      stripeCustomerId: booking.user.stripeCustomerId,
      amountCents: noShowFee.amountCents,
    }).catch(() => null);
  }

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
          ? noShowPaymentIntentId
            ? `${noShowFee.amountCents === 1_000 ? '$10' : '$5'} no-show fee charged to your saved payment method.`
            : `${noShowFee.amountCents === 1_000 ? '$10' : '$5'} no-show fee may apply according to the Rhyze cancellation policy.`
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
