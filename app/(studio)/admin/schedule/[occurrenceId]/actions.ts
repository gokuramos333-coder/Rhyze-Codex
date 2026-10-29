'use server';

import { Prisma } from '@prisma/client';
import { hasScheduleConflict } from '@/lib/domain/schedule/conflict-service';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { parseClassPriceCents } from '@/lib/catalog/class-pricing';
import { prisma } from '@/lib/db/prisma';
import { requireAssignableInstructor } from '@/lib/domain/instructors/assignment';
import { cancelOccurrencesWithNotifications } from '@/lib/domain/schedule/management-cancellation';
import { normalizeInstructorPayMethod, parseDollarCents } from '@/lib/domain/instructors/pay-rates';
import { cleanOptionalText, parseOccurrenceLocalStart } from '@/lib/domain/schedule/occurrence-management';

const studioTimezone = 'America/New_York';

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

export async function updateOccurrenceAction(formData: FormData) {
  const actor = await requireArea('admin');
  const id = String(formData.get('id') || '');
  await prisma.$transaction(async (tx) => {
    // Coordinate with schedule imports; serializable reads fail closed on concurrent edits.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rhyze-schedule-import'))`;
    const current = await tx.classOccurrence.findUnique({ where: { id }, include: { template: true } });
    if (!current) return;
    const startAt = parseOccurrenceLocalStart(
      String(formData.get('startAt') || ''),
      current.timezone || studioTimezone,
    );
    const instructorPayMethod = normalizeInstructorPayMethod(formData.get('instructorPayMethod'));
    const instructorPayCents = parseDollarCents(formData.get('instructorPayAmount'));
    const priceCents = parseClassPriceCents(formData.get('dropInPrice'));
    if (priceCents === null) {
      redirect(`/admin/schedule/${id}?error=price`);
    }
    // Older forms omit the field: retain this occurrence's duration, including overrides.
    const durationMinutes = formData.has('durationMinutes')
      ? Number(formData.get('durationMinutes'))
      : (current.endAt.getTime() - current.startAt.getTime()) / 60_000;
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
      redirect(`/admin/schedule/${id}?error=duration`);
    }
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    const instructorId = String(formData.get('instructorId') || '') || null;
    // Historical/cancelled rows may retain legacy ownership; scheduled rows may not.
    if (current.status === 'SCHEDULED' && endAt > new Date()) {
      try {
        await requireAssignableInstructor(instructorId);
      } catch {
        redirect(`/admin/schedule/${id}?error=instructor`);
      }
    }
    const data = {
      instructorId,
      roomId: formData.has('roomId') ? String(formData.get('roomId') || '') || null : current.roomId,
      startAt,
      endAt,
      capacity: Math.max(1, Number(formData.get('capacity') || current.capacity)),
      priceCents,
      titleOverride: cleanOptionalText(formData.get('titleOverride')),
      substituteInstructorName: cleanOptionalText(formData.get('substituteInstructorName')),
      isSubstitute: formData.get('isSubstitute') === 'on',
      publicNotes: cleanOptionalText(formData.get('publicNotes')),
      internalNotes: cleanOptionalText(formData.get('internalNotes')),
      instructorPayMethod,
      instructorPayCents,
      instructorPayNote: cleanOptionalText(formData.get('instructorPayNote')),
    };
    if (current.status === 'SCHEDULED') {
      const resources = [
        ...(data.roomId ? [{ roomId: data.roomId }] : []),
        ...(instructorId ? [{ instructorId }] : []),
      ];
      if (resources.length) {
        const conflicts = await tx.classOccurrence.findMany({
          where: { id: { not: id }, status: 'SCHEDULED', OR: resources,
            startAt: { lt: endAt }, endAt: { gt: startAt } },
          select: { startAt: true, endAt: true },
        });
        if (conflicts.some(item => hasScheduleConflict(item, { startAt, endAt }))) {
          redirect(`/admin/schedule/${id}?error=conflict`);
        }
      }
    }
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
          priceCents: current.priceCents,
        },
        after: data,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath('/admin/schedule');
  revalidatePath(`/admin/schedule/${id}`);
  revalidatePath('/schedule');
  revalidatePath(`/schedule/${id}`);
  redirect(`/admin/schedule/${id}?saved=1`);
}

export async function duplicateOccurrenceAction(formData: FormData) {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  const item = await prisma.classOccurrence.findUnique({ where: { id } });
  if (!item) return;
  try {
    await requireAssignableInstructor(item.instructorId);
  } catch {
    redirect(`/admin/schedule/${id}?error=instructor`);
  }
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
  await cancelOccurrencesWithNotifications(prisma, actor.id, [id], reason);
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
  await cancelOccurrencesWithNotifications(prisma, actor.id, occurrences.map((item) => item.id), 'Series cancelled by studio');
  revalidatePath('/admin/schedule');
  revalidatePath('/schedule');
  redirect('/admin/schedule');
}
