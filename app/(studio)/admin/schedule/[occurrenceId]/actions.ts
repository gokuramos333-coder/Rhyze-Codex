'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { queueEmail } from '@/lib/notifications/email-queue';
import { normalizeInstructorPayMethod, parseDollarCents } from '@/lib/domain/instructors/pay-rates';
import { cleanOptionalText, occurrenceLocalTimeZone, occurrenceTitle, parseOccurrenceLocalStart } from '@/lib/domain/schedule/occurrence-management';

const studioTimezone = 'America/New_York';

function classDate(value: Date) {
  return value.toLocaleDateString('en-US', {
    timeZone: occurrenceLocalTimeZone(), weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function classTime(value: Date) {
  return value.toLocaleTimeString('en-US', {
    timeZone: occurrenceLocalTimeZone(), hour: 'numeric', minute: '2-digit',
  });
}

function resolveCancellationReason(formData: FormData) {
  const customReason = String(formData.get('customCancellationReason') || '').trim();
  if (customReason) return customReason;

  const reasonType = String(formData.get('cancellationReasonType') || 'general');
  switch (reasonType) {
    case 'weather':
      return 'Due to weather conditions, the studio needs to cancel this class.';
    case 'instructor':
      return 'Due to an instructor emergency, the studio needs to cancel this class.';
    case 'lowAttendance':
      return 'Cancelled by studio: 0 signups 2 hours before class start.';
    case 'general':
    default:
      return 'The studio needs to cancel this class. Thank you for your understanding.';
  }
}

async function cancelOccurrencesWithNotifications(
  actorId: string,
  occurrenceIds: string[],
  reason: string,
) {
  const occurrences = await prisma.classOccurrence.findMany({
    where: { id: { in: occurrenceIds }, status: 'SCHEDULED' },
    include: {
      template: true,
      bookings: { where: { status: 'CONFIRMED' }, include: { user: true } },
    },
  });
  await prisma.$transaction(async (tx) => {
    for (const occurrence of occurrences) {
      await tx.classOccurrence.update({
        where: { id: occurrence.id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
      });
      for (const booking of occurrence.bookings) {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
        const reservation = await tx.creditLedgerEntry.findFirst({
          where: { bookingId: booking.id, type: 'RESERVE' },
        });
        if (reservation) {
          const released = await tx.creditLedgerEntry.findFirst({
            where: { bookingId: booking.id, type: { in: ['RELEASE', 'RESTORE'] } },
          });
          if (!released) {
            await tx.creditLedgerEntry.create({
              data: {
                creditAccountId: reservation.creditAccountId,
                bookingId: booking.id,
                type: 'RELEASE',
                quantity: 1,
                reason: 'Studio cancelled class',
              },
            });
          }
        }
        await tx.inAppNotification.upsert({
          where: { dedupeKey: `class-cancelled:${occurrence.id}:${booking.userId}` },
          update: {},
          create: {
            userId: booking.userId,
            title: `${occurrenceTitle(occurrence)} was cancelled`,
            body: reason,
            link: '/member/bookings',
            dedupeKey: `class-cancelled:${occurrence.id}:${booking.userId}`,
          },
        });
        await queueEmail(tx, {
          userId: booking.userId,
          to: booking.user.email,
          subject: `${occurrence.template.name} was cancelled`,
          template: 'CLASS_CANCELLED',
          payload: {
            name: booking.user.name || 'Rhyzer',
            className: occurrenceTitle(occurrence),
            classDate: classDate(occurrence.startAt),
            classTime: classTime(occurrence.startAt),
            reason,
            creditResult: 'Your eligible class credit was returned automatically.',
          },
          dedupeKey: `class-cancelled-email:${occurrence.id}:${booking.userId}`,
        });
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'class.cancelled.by-management',
          entityType: 'ClassOccurrence',
          entityId: occurrence.id,
          after: { reason, notifiedMembers: occurrence.bookings.length },
        },
      });
    }
  });
}

export async function updateOccurrenceAction(formData: FormData) {
  const actor = await requireArea('admin');
  const id = String(formData.get('id') || '');
  const current = await prisma.classOccurrence.findUnique({ where: { id }, include: { template: true } });
  if (!current) return;
  const startAt = parseOccurrenceLocalStart(
    String(formData.get('startAt') || ''),
    current.timezone || studioTimezone,
  );
  const instructorPayMethod = normalizeInstructorPayMethod(formData.get('instructorPayMethod'));
  const instructorPayCents = parseDollarCents(formData.get('instructorPayAmount'));
  const endAt = new Date(startAt.getTime() + current.template.durationMinutes * 60_000);
  const data = {
    instructorId: String(formData.get('instructorId') || '') || null,
    roomId: formData.has('roomId') ? String(formData.get('roomId') || '') || null : current.roomId,
    startAt,
    endAt,
    capacity: Math.max(1, Number(formData.get('capacity') || current.capacity)),
    titleOverride: cleanOptionalText(formData.get('titleOverride')),
    substituteInstructorName: cleanOptionalText(formData.get('substituteInstructorName')),
    isSubstitute: formData.get('isSubstitute') === 'on',
    publicNotes: cleanOptionalText(formData.get('publicNotes')),
    internalNotes: cleanOptionalText(formData.get('internalNotes')),
    instructorPayMethod,
    instructorPayCents,
    instructorPayNote: cleanOptionalText(formData.get('instructorPayNote')),
  };
  await prisma.$transaction(async (tx) => {
    await tx.classOccurrence.update({ where: { id }, data });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'class-occurrence.updated.by-admin',
        entityType: 'ClassOccurrence',
        entityId: id,
        before: {
          startAt: current.startAt,
          endAt: current.endAt,
          instructorId: current.instructorId,
          titleOverride: current.titleOverride,
          substituteInstructorName: current.substituteInstructorName,
          isSubstitute: current.isSubstitute,
        },
        after: data,
      },
    });
  });
  revalidatePath('/admin/schedule');
  revalidatePath(`/admin/schedule/${id}`);
  revalidatePath('/schedule');
  redirect(`/admin/schedule/${id}?saved=1`);
}

export async function duplicateOccurrenceAction(formData: FormData) {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  const item = await prisma.classOccurrence.findUnique({ where: { id } });
  if (!item) return;
  const requestedStart = String(formData.get('duplicateStartAt') || '').trim();
  const parsedStart = requestedStart ? parseOccurrenceLocalStart(requestedStart, item.timezone || studioTimezone) : null;
  const startAt = parsedStart && !Number.isNaN(parsedStart.getTime())
    ? parsedStart
    : new Date(item.startAt.getTime() + 7 * 24 * 60 * 60_000);
  const copy = await prisma.classOccurrence.create({
    data: { templateId: item.templateId, instructorId: item.instructorId, roomId: item.roomId, startAt, endAt: new Date(startAt.getTime() + (item.endAt.getTime() - item.startAt.getTime())), timezone: item.timezone, capacity: item.capacity, priceCents: item.priceCents, publicNotes: item.publicNotes, internalNotes: item.internalNotes, instructorPayMethod: item.instructorPayMethod, instructorPayCents: item.instructorPayCents, instructorPayNote: item.instructorPayNote },
  });
  revalidatePath('/admin/schedule');
  revalidatePath('/admin/events');
  redirect(`/admin/schedule/${copy.id}?saved=duplicate`);
}

export async function cancelOccurrenceAction(formData: FormData) {
  const actor = await requireArea('admin');
  const id = String(formData.get('id') || '');
  const reason = resolveCancellationReason(formData);
  await cancelOccurrencesWithNotifications(actor.id, [id], reason);
  revalidatePath('/admin/schedule');
  revalidatePath('/schedule');
  redirect('/admin/schedule');
}

export async function cancelSeriesAction(formData: FormData) {
  const actor = await requireArea('admin');
  const seriesId = String(formData.get('seriesId') || '');
  if (!seriesId) return;
  const occurrences = await prisma.classOccurrence.findMany({
    where: { seriesId, startAt: { gte: new Date() }, status: 'SCHEDULED' },
    select: { id: true },
  });
  await prisma.classSeries.update({ where: { id: seriesId }, data: { isActive: false } });
  await cancelOccurrencesWithNotifications(actor.id, occurrences.map((item) => item.id), 'Series cancelled by studio');
  revalidatePath('/admin/schedule');
  revalidatePath('/schedule');
  redirect('/admin/schedule');
}
