'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { queueEmail } from '@/lib/notifications/email-queue';

export async function sendClassMessageAction(formData: FormData) {
  const instructor = await requireArea('instructor');
  const occurrenceId = String(formData.get('occurrenceId') || '');
  const subject = String(formData.get('subject') || '').trim();
  const body = String(formData.get('body') || '').trim();
  if (!subject || body.length < 10) redirect(`/instructor/classes/${occurrenceId}/message?error=message`);
  const occurrence = await prisma.classOccurrence.findFirst({
    where: { id: occurrenceId, instructorId: instructor.id },
    include: { template: true, bookings: { where: { status: 'CONFIRMED' }, include: { user: true } } },
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
        payload: { body, occurrenceId, messageId: message.id },
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
  const reason = String(formData.get('reason') || '').trim();
  if (reason.length < 10) redirect(`/instructor/classes/${occurrenceId}/message?error=reason`);
  const occurrence = await prisma.classOccurrence.findFirst({
    where: { id: occurrenceId, instructorId: instructor.id, status: 'SCHEDULED' },
    include: { template: true, bookings: { where: { status: 'CONFIRMED' }, include: { user: true } } },
  });
  if (!occurrence) redirect('/instructor/schedule');
  await prisma.$transaction(async (tx) => {
    await tx.classOccurrence.update({ where: { id: occurrenceId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason } });
    for (const booking of occurrence.bookings) {
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      const reservation = await tx.creditLedgerEntry.findFirst({ where: { bookingId: booking.id, type: 'RESERVE' } });
      if (reservation) {
        const released = await tx.creditLedgerEntry.findFirst({ where: { bookingId: booking.id, type: { in: ['RELEASE','RESTORE'] } } });
        if (!released) await tx.creditLedgerEntry.create({ data: { creditAccountId: reservation.creditAccountId, bookingId: booking.id, type: 'RELEASE', quantity: 1, reason: 'Instructor cancelled class' } });
      }
      await tx.inAppNotification.create({ data: { userId: booking.userId, title: `${occurrence.template.name} was cancelled`, body: reason, link: '/member/bookings', dedupeKey: `class-cancelled:${occurrenceId}:${booking.userId}` } });
      await queueEmail(tx, { userId: booking.userId, to: booking.user.email, subject: `${occurrence.template.name} was cancelled`, template: 'CLASS_CANCELLED', payload: { reason, occurrenceId }, dedupeKey: `class-cancelled-email:${occurrenceId}:${booking.userId}` });
    }
    await tx.classMessage.create({ data: { occurrenceId, instructorId: instructor.id, subject: `${occurrence.template.name} cancelled`, body: reason, kind: 'CANCELLATION', recipientCount: occurrence.bookings.length } });
    await tx.auditLog.create({ data: { actorId: instructor.id, action: 'class.cancelled.by-instructor', entityType: 'ClassOccurrence', entityId: occurrenceId } });
  });
  revalidatePath('/instructor/schedule');
  revalidatePath('/schedule');
  redirect('/instructor/schedule?cancelled=1');
}
