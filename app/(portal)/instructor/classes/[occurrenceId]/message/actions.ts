'use server';
import { instructorOccurrenceTitle } from '@/lib/domain/schedule/occurrence-management';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';
import { renewalBookingSpend } from '@/lib/domain/bookings/vip-renewal-continuity';
import { queueEmail } from '@/lib/notifications/email-queue';

function classDate(value: Date) {
  return value.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' });
}

function classTime(value: Date) {
  return value.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
}

function resolveCancellationReason(formData: FormData) {
  const customReason = String(formData.get('customCancellationReason') || '').trim();
  if (customReason) return customReason;

  const reasonType = String(formData.get('cancellationReasonType') || 'instructor');
  switch (reasonType) {
    case 'weather':
      return 'Due to weather conditions, we need to cancel this class.';
    case 'general':
      return 'We need to cancel this class. Thank you for your understanding.';
    case 'instructor':
    default:
      return 'Due to an instructor emergency, we need to cancel this class.';
  }
}

export async function sendClassMessageAction(formData: FormData) {
  const instructor = await requireArea('instructor');
  const occurrenceId = String(formData.get('occurrenceId') || '');
  const subject = String(formData.get('subject') || '').trim();
  const body = String(formData.get('body') || '').trim();
  if (!subject || body.length < 10) redirect(`/instructor/classes/${occurrenceId}/message?error=message`);
  const occurrence = await prisma.classOccurrence.findFirst({
    where: { id: occurrenceId, instructorId: instructor.id },
    include: { template: true, instructor: {select:{name:true}}, bookings: { where: { status: 'CONFIRMED' }, include: { user: true } } },
  });
  if (!occurrence) redirect('/instructor/schedule');
  await prisma.$transaction(async (tx) => {
    const message = await tx.classMessage.create({
      data: { occurrenceId, instructorId: instructor.id, subject, body, recipientCount: occurrence.bookings.length },
    });
    for (const booking of occurrence.bookings) {
      await tx.inAppNotification.create({
        data: { userId: booking.userId, title: subject, body, link: '/member/bookings', dedupeKey: `class-message:${message.id}:${booking.userId}` },
      });
      await queueEmail(tx, {
        userId: booking.userId,
        to: booking.user.email,
        subject,
        template: 'CLASS_UPDATE',
        payload: {
          name: booking.user.name || 'Rhyzer',
          messageSubject: subject,
          body,
          className: instructorOccurrenceTitle(occurrence),
          classDate: classDate(occurrence.startAt),
          classTime: classTime(occurrence.startAt),
          bookingsUrl: '/member/bookings',
          messageId: message.id,
        },
        dedupeKey: `class-message-email:${message.id}:${booking.userId}`,
      });
    }
    await tx.auditLog.create({ data: { actorId: instructor.id, action: 'class.message.sent', entityType: 'ClassOccurrence', entityId: occurrenceId } });
  });
  revalidatePath(`/instructor/classes/${occurrenceId}/message`);
  redirect(`/instructor/classes/${occurrenceId}/message?sent=1`);
}

export async function cancelAssignedClassAction(formData: FormData) {
  const instructor = await requireArea('instructor');
  const occurrenceId = String(formData.get('occurrenceId') || '');
  const reason = resolveCancellationReason(formData);
  if (reason.length < 10) redirect(`/instructor/classes/${occurrenceId}/message?error=reason`);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${occurrenceId}))`;
    const occurrence = await tx.classOccurrence.findFirst({
      where: { id: occurrenceId, instructorId: instructor.id, status: 'SCHEDULED' },
      include: { template: true, instructor: {select:{name:true}}, bookings: { where: { status: 'CONFIRMED' }, include: { user: true } } },
    });
    if (!occurrence) return;
    for (const userId of [...new Set(occurrence.bookings.map(b => b.userId))].sort()) {
      await lockMembershipEntitlements(tx, userId);
    }
    await tx.classOccurrence.update({ where: { id: occurrenceId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason } });
    for (const booking of occurrence.bookings) {
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      const spend = await renewalBookingSpend(tx, booking.id);
      for (const item of spend) await tx.creditLedgerEntry.create({ data: {
        ...item, bookingId: booking.id, type: 'RELEASE', reason: 'Instructor cancelled class',
      } });
      await tx.inAppNotification.create({ data: { userId: booking.userId, title: `${instructorOccurrenceTitle(occurrence)} was cancelled`, body: reason, link: '/member/bookings', dedupeKey: `class-cancelled:${occurrenceId}:${booking.userId}` } });
      await queueEmail(tx, {
        userId: booking.userId,
        to: booking.user.email,
        subject: `${instructorOccurrenceTitle(occurrence)} was cancelled`,
        template: 'CLASS_CANCELLED',
        payload: {
          name: booking.user.name || 'Rhyzer',
          className: instructorOccurrenceTitle(occurrence),
          classDate: classDate(occurrence.startAt),
          classTime: classTime(occurrence.startAt),
          reason,
          creditResult: spend.length > 0 ? 'Your eligible class credit was returned automatically.' : 'No outstanding class credit needed to be returned.',
        },
        dedupeKey: `class-cancelled-email:${occurrenceId}:${booking.userId}`,
      });
    }
    await tx.classMessage.create({ data: { occurrenceId, instructorId: instructor.id, subject: `${instructorOccurrenceTitle(occurrence)} cancelled`, body: reason, kind: 'CANCELLATION', recipientCount: occurrence.bookings.length } });
    await tx.auditLog.create({ data: { actorId: instructor.id, action: 'class.cancelled.by-instructor', entityType: 'ClassOccurrence', entityId: occurrenceId } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
  revalidatePath('/instructor/schedule');
  revalidatePath('/schedule');
  redirect('/instructor/schedule?cancelled=1');
}
