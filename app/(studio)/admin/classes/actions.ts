'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { hasScheduleConflict } from '@/lib/domain/schedule/conflict-service';
import { expandWeeklyRecurrence } from '@/lib/domain/schedule/recurrence-service';
import { newClassStartDates } from '@/lib/domain/schedule/public-calendar';
import { putClassGalleryImage, putPublicImage } from '@/lib/storage/object-storage';
import { parseClassPriceCents } from '@/lib/catalog/class-pricing';
import { defaultInstructorPayForOccurrence } from '@/lib/domain/instructors/pay-rates';
import { parseOccurrenceLocalStart } from '@/lib/domain/schedule/occurrence-management';
import { classTemplateHasProtectedHistory } from '@/lib/domain/classes/class-template-deletion';
import { assignableInstructorWhere } from '@/lib/admin/assignable-instructors';

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export async function addClassGalleryImageAction(formData: FormData) {
  const actor = await requireArea('admin');
  const image = formData.get('image');
  const altText = String(formData.get('altText') || '').trim().slice(0, 160);
  if (!(image instanceof File) || !image.size || !altText) {
    redirect('/admin/classes?error=gallery-image');
  }
  let imageUrl: string;
  try {
    imageUrl = await putClassGalleryImage(image);
  } catch {
    redirect('/admin/classes?error=gallery-image');
  }
  const highest = await prisma.classGalleryImage.aggregate({ _max: { position: true } });
  const created = await prisma.classGalleryImage.create({
    data: { imageUrl, altText, position: (highest._max.position ?? -1) + 1 },
  });
  await prisma.auditLog.create({
    data: { actorId: actor.id, action: 'class-gallery-image.created', entityType: 'ClassGalleryImage', entityId: created.id },
  });
  revalidatePath('/admin/classes');
  revalidatePath('/classes');
  redirect('/admin/classes?saved=gallery-image');
}

export async function removeClassGalleryImageAction(formData: FormData) {
  const actor = await requireArea('admin');
  const imageId = String(formData.get('imageId') || '');
  if (!imageId) return;
  await prisma.$transaction([
    prisma.classGalleryImage.updateMany({ where: { id: imageId }, data: { isActive: false } }),
    prisma.auditLog.create({ data: { actorId: actor.id, action: 'class-gallery-image.removed', entityType: 'ClassGalleryImage', entityId: imageId } }),
  ]);
  revalidatePath('/admin/classes');
  revalidatePath('/classes');
}

export async function reorderClassGalleryImagesAction(formData: FormData) {
  const actor = await requireArea('admin');
  const orderedIds = String(formData.get('orderedIds') || '').split(',').filter(Boolean);
  if (!orderedIds.length) return;
  await prisma.$transaction([
    ...orderedIds.map((id, position) => prisma.classGalleryImage.updateMany({ where: { id, isActive: true }, data: { position } })),
    prisma.auditLog.create({ data: { actorId: actor.id, action: 'class-gallery.reordered', entityType: 'ClassGalleryImage', entityId: 'classes-page' } }),
  ]);
  revalidatePath('/admin/classes');
  revalidatePath('/classes');
  redirect('/admin/classes?saved=gallery-order');
}

export async function createClassTemplateAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireArea('admin');
  const name = String(formData.get('name') || '').trim();
  const categoryId = String(formData.get('categoryId') || '');
  const description = String(formData.get('description') || '').trim();
  const durationMinutes = Number(formData.get('durationMinutes'));
  const defaultCapacity = Number(formData.get('defaultCapacity'));
  const isEvent = formData.get('isEvent') === 'on';
  const dropInPriceCents = parseClassPriceCents(formData.get('dropInPrice'));
  const instructorId = String(formData.get('instructorId') || '');
  const startLocal = String(formData.get('startAt') || '');
  const repeatWeekly = formData.get('repeatWeekly') === 'on';
  const repeatWeeks = Number(formData.get('repeatWeeks') || 8);
  const image = formData.get('image');
  let imageUrl = String(formData.get('imageUrl') || '').trim() || null;

  if (
    !name ||
    !categoryId ||
    !description ||
    durationMinutes < 15 ||
    defaultCapacity < 1 ||
    dropInPriceCents === null ||
    (!isEvent && (!instructorId || !startLocal))
  ) {
    redirect('/admin/classes?error=invalid');
  }
  if (image instanceof File && image.size > 0) {
    try {
      imageUrl = await putPublicImage(image);
    } catch {
      redirect(isEvent ? '/admin/events?error=image' : '/admin/classes?error=image');
    }
  }

  const timezone = 'America/New_York';
  const starts = isEvent
    ? []
    : newClassStartDates(startLocal, repeatWeekly, repeatWeeks, timezone);
  const ends = starts.map(
    (startAt) => new Date(startAt.getTime() + durationMinutes * 60_000),
  );
  if (!isEvent) {
    const instructor = await prisma.user.findFirst({
      where: {
        id: instructorId,
        ...assignableInstructorWhere,
      },
      select: { id: true, instructorProfile: { select: { standardClassRateCents: true, specialtyEventRateCents: true } } },
    });
    if (!instructor || !starts.length) {
      redirect('/admin/classes?error=invalid');
    }
    const conflicts = await prisma.classOccurrence.findMany({
      where: { instructorId, status: 'SCHEDULED' },
      select: { startAt: true, endAt: true },
    });
    if (
      starts.some((startAt, index) =>
        conflicts.some((item) =>
          hasScheduleConflict(item, { startAt, endAt: ends[index] }),
        ),
      )
    ) {
      redirect('/admin/classes?error=conflict');
    }
  }
  const room = isEvent
    ? null
    : await prisma.room.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
  const instructorPayProfile = instructorId
    ? await prisma.instructorProfile.findUnique({
        where: { userId: instructorId },
        select: { standardClassRateCents: true, specialtyEventRateCents: true },
      })
    : null;
  const defaultInstructorPay = defaultInstructorPayForOccurrence({
    isEvent,
    standardClassRateCents: instructorPayProfile?.standardClassRateCents,
    specialtyEventRateCents: instructorPayProfile?.specialtyEventRateCents,
  });

  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.classTemplate.create({
      data: {
        name,
        slug: `${slugify(name)}-${Date.now().toString(36)}`,
        categoryId,
        description,
        imageUrl,
        durationMinutes,
        defaultCapacity,
        dropInPriceCents,
        intensity: 'ALL_LEVELS',
        tags: [],
        equipment: [],
        isEvent,
      },
    });
    let seriesId: string | null = null;
    if (repeatWeekly && starts.length) {
      const series = await tx.classSeries.create({
        data: {
          templateId: created.id,
          instructorId,
          roomId: room?.id || null,
          timezone,
          recurrenceRule: `FREQ=WEEKLY;COUNT=${starts.length}`,
          startsAt: starts[0],
          capacity: defaultCapacity,
          priceCents: dropInPriceCents,
        },
      });
      seriesId = series.id;
    }
    for (let index = 0; index < starts.length; index += 1) {
      await tx.classOccurrence.create({
        data: {
          templateId: created.id,
          seriesId,
          instructorId,
          roomId: room?.id || null,
          startAt: starts[index],
          endAt: ends[index],
          timezone,
          capacity: defaultCapacity,
          priceCents: dropInPriceCents,
          instructorPayMethod: defaultInstructorPay.method,
          instructorPayCents: defaultInstructorPay.cents,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: repeatWeekly
          ? `class-template.created-with-series:${starts.length}`
          : 'class-template.created',
        entityType: 'ClassTemplate',
        entityId: created.id,
      },
    });
    return created;
  });

  revalidatePath('/admin/classes');
  revalidatePath('/');
  revalidatePath('/schedule');
  redirect(isEvent ? '/admin/events?saved=1' : '/admin/classes?saved=1');
}

export async function archiveClassTemplateAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireArea('admin');
  const id = String(formData.get('id') || '');
  await prisma.$transaction([
    prisma.classTemplate.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'class-template.archived',
        entityType: 'ClassTemplate',
        entityId: id,
      },
    }),
  ]);
  revalidatePath('/admin/classes');
  revalidatePath('/schedule');
}

export async function duplicateClassTemplateAction(formData: FormData): Promise<void> {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  const source = await prisma.classTemplate.findUnique({ where: { id } });
  if (!source) return;
  const { id: _id, createdAt: _created, updatedAt: _updated, archivedAt: _archived, ...data } = source;
  await prisma.classTemplate.create({
    data: { ...data, name: `${source.name} Copy`, slug: `${source.slug}-copy-${Date.now().toString(36)}`, isActive: true },
  });
  revalidatePath('/admin/classes');
}

export async function deleteClassTemplateAction(formData: FormData): Promise<void> {
  const actor = await requireArea('admin');
  const id = String(formData.get('id') || '');
  const template = await prisma.classTemplate.findUnique({
    where: { id },
    include: {
      occurrences: {
        select: {
          _count: {
            select: {
              bookings: true,
              waitlistEntries: true,
              attendanceRecords: true,
              classMessages: true,
              commerceOrders: true,
            },
          },
        },
      },
    },
  });
  if (!template) return;
  if (classTemplateHasProtectedHistory(template.occurrences)) {
    redirect('/admin/classes?error=history');
  }
  await prisma.$transaction([
    prisma.classOccurrence.deleteMany({ where: { templateId: id } }),
    prisma.classSeries.deleteMany({ where: { templateId: id } }),
    prisma.classTemplate.delete({ where: { id } }),
    prisma.auditLog.create({ data: { actorId: actor.id, action: 'class-template.deleted', entityType: 'ClassTemplate', entityId: id } }),
  ]);
  revalidatePath('/admin/classes');
  revalidatePath('/admin/offerings');
  revalidatePath('/schedule');
  revalidatePath('/classes');
  redirect('/admin/classes?saved=deleted');
}

export async function createOccurrenceAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireArea('admin');
  const templateId = String(formData.get('templateId') || '');
  const instructorId = String(formData.get('instructorId') || '') || null;
  let roomId = String(formData.get('roomId') || '') || null;
  const startAt = parseOccurrenceLocalStart(String(formData.get('startAt') || ''));
  const template = await prisma.classTemplate.findUnique({
    where: { id: templateId },
  });
  const instructorPayProfile = instructorId
    ? await prisma.instructorProfile.findUnique({ where: { userId: instructorId } })
    : null;
  if (!template || Number.isNaN(startAt.getTime())) {
    redirect('/admin/schedule?error=invalid');
  }
  const endAt = new Date(
    startAt.getTime() + template.durationMinutes * 60 * 1000,
  );
  if (!roomId) {
    const room = await prisma.room.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    roomId = room?.id || null;
  }

  const conflicts = await prisma.classOccurrence.findMany({
    where: {
      status: 'SCHEDULED',
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      OR: [
        ...(instructorId ? [{ instructorId }] : []),
        ...(roomId ? [{ roomId }] : []),
      ],
    },
    select: { startAt: true, endAt: true },
  });
  if (
    conflicts.some((existing) =>
      hasScheduleConflict(existing, { startAt, endAt }),
    )
  ) {
    redirect('/admin/schedule?error=conflict');
  }

  const occurrencePay = defaultInstructorPayForOccurrence({
    isEvent: template.isEvent,
    standardClassRateCents: instructorPayProfile?.standardClassRateCents,
    specialtyEventRateCents: instructorPayProfile?.specialtyEventRateCents,
  });

  const occurrence = await prisma.classOccurrence.create({
    data: {
      templateId,
      instructorId,
      roomId,
      startAt,
      endAt,
      capacity: template.defaultCapacity,
      priceCents: template.dropInPriceCents,
      instructorPayMethod: occurrencePay.method,
      instructorPayCents: occurrencePay.cents,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: 'class-occurrence.created',
      entityType: 'ClassOccurrence',
      entityId: occurrence.id,
    },
  });

  revalidatePath('/admin/schedule');
  revalidatePath('/schedule');
  redirect('/admin/schedule?saved=1');
}

export async function createRecurringOccurrencesAction(formData: FormData): Promise<void> {
  const actor = await requireArea('admin');
  const templateId = String(formData.get('templateId') || '');
  const instructorId = String(formData.get('instructorId') || '') || null;
  let roomId = String(formData.get('roomId') || '') || null;
  const startLocal = String(formData.get('startAt') || '');
  const count = Math.min(52, Math.max(2, Number(formData.get('count') || 4)));
  const timezone = 'America/New_York';
  const template = await prisma.classTemplate.findUnique({ where: { id: templateId } });
  const instructorPayProfile = instructorId
    ? await prisma.instructorProfile.findUnique({ where: { userId: instructorId } })
    : null;
  if (!template) redirect('/admin/schedule?error=invalid');
  const starts = expandWeeklyRecurrence({ startLocal, timezone, intervalWeeks: 1, count });
  const ends = starts.map((startAt) => new Date(startAt.getTime() + template.durationMinutes * 60_000));
  if (!roomId) {
    const room = await prisma.room.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    roomId = room?.id || null;
  }
  const conflicts = await prisma.classOccurrence.findMany({
    where: { status: 'SCHEDULED', OR: [...(instructorId ? [{ instructorId }] : []), ...(roomId ? [{ roomId }] : [])] },
    select: { startAt: true, endAt: true },
  });
  if (starts.some((startAt, index) => conflicts.some((item) => hasScheduleConflict(item, { startAt, endAt: ends[index] })))) {
    redirect('/admin/schedule?error=conflict');
  }
  const occurrencePay = defaultInstructorPayForOccurrence({
    isEvent: template.isEvent,
    standardClassRateCents: instructorPayProfile?.standardClassRateCents,
    specialtyEventRateCents: instructorPayProfile?.specialtyEventRateCents,
  });
  const series = await prisma.classSeries.create({
    data: { templateId, instructorId, roomId, timezone, recurrenceRule: `FREQ=WEEKLY;COUNT=${count}`, startsAt: starts[0] },
  });
  await prisma.$transaction([
    ...starts.map((startAt, index) => prisma.classOccurrence.create({
      data: { templateId, seriesId: series.id, instructorId, roomId, startAt, endAt: ends[index], timezone, capacity: template.defaultCapacity, priceCents: template.dropInPriceCents, instructorPayMethod: occurrencePay.method, instructorPayCents: occurrencePay.cents },
    })),
    prisma.auditLog.create({ data: { actorId: actor.id, action: `class-series.created:${count}`, entityType: 'ClassSeries', entityId: series.id } }),
  ]);
  revalidatePath('/admin/schedule');
  revalidatePath('/schedule');
  redirect('/admin/schedule?saved=series');
}
