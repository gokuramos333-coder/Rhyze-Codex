'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { deleteObject, putPublicImage } from '@/lib/storage/object-storage';
import {
  parseClassPriceCents,
  shouldSyncOccurrencePrice,
} from '@/lib/catalog/class-pricing';

export async function updateClassTemplateAction(formData: FormData) {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  const current = await prisma.classTemplate.findUnique({ where: { id }, select: { imageUrl: true, isEvent: true, dropInPriceCents: true } });
  if (!current) redirect('/admin/classes');
  const dropInPriceCents = parseClassPriceCents(formData.get('dropInPrice'));
  if (dropInPriceCents === null) {
    redirect(`/admin/classes/${id}?error=price`);
  }
  const image = formData.get('image');
  let imageUrl = String(formData.get('imageUrl') || '').trim() || null;
  if (image instanceof File && image.size > 0) {
    try {
      imageUrl = await putPublicImage(image);
    } catch {
      redirect(`/admin/classes/${id}?error=image`);
    }
  }
  const inheritedOccurrences = await prisma.classOccurrence.findMany({
    where: { templateId: id, status: 'SCHEDULED' },
    select: { id: true, priceCents: true },
  });
  const occurrenceIdsToSync = inheritedOccurrences
    .filter((occurrence) =>
      shouldSyncOccurrencePrice(
        current.dropInPriceCents,
        occurrence.priceCents,
      ),
    )
    .map((occurrence) => occurrence.id);
  await prisma.$transaction([
    prisma.classTemplate.update({
      where: { id },
      data: {
      name: String(formData.get('name') || '').trim(),
      categoryId: String(formData.get('categoryId') || ''),
      description: String(formData.get('description') || '').trim(),
      imageUrl,
      durationMinutes: Number(formData.get('durationMinutes')),
      defaultCapacity: Number(formData.get('defaultCapacity')),
      dropInPriceCents,
      intensity: String(formData.get('intensity') || 'ALL_LEVELS') as 'LOW' | 'MODERATE' | 'HIGH' | 'ALL_LEVELS',
      tags: String(formData.get('tags') || '').split(',').map((item) => item.trim()).filter(Boolean),
      equipment: String(formData.get('equipment') || '').split(',').map((item) => item.trim()).filter(Boolean),
      cancellationPolicy: String(formData.get('cancellationPolicy') || '') || null,
      isActive: formData.get('isActive') === 'on',
      archivedAt: formData.get('isActive') === 'on' ? null : new Date(),
      },
    }),
    prisma.classOccurrence.updateMany({
      where: { id: { in: occurrenceIdsToSync } },
      data: { priceCents: dropInPriceCents },
    }),
    prisma.classSeries.updateMany({
      where: {
        templateId: id,
        isActive: true,
        OR: [
          { priceCents: current.dropInPriceCents },
          { priceCents: null },
        ],
      },
      data: { priceCents: dropInPriceCents },
    }),
  ]);
  if (
    imageUrl !== current.imageUrl &&
    (current.imageUrl?.startsWith('/uploads/') ||
      current.imageUrl?.startsWith('/api/media/'))
  ) {
    await deleteObject(current.imageUrl);
  }
  revalidatePath('/admin/classes');
  revalidatePath('/admin/events');
  revalidatePath('/schedule');
  revalidatePath('/classes');
  revalidatePath('/events');
  redirect(`/admin/classes/${id}?saved=1`);
}

export async function assignTemplateInstructorAction(formData: FormData) {
  await requireArea('admin');
  const templateId = String(formData.get('templateId') || '');
  const instructorId = String(formData.get('instructorId') || '') || null;
  const instructor = instructorId
    ? await prisma.user.findFirst({
        where: { id: instructorId, instructorProfile: { isNot: null } },
        select: { id: true },
      })
    : null;
  if (instructorId && !instructor) {
    redirect(`/admin/classes/${templateId}?error=instructor`);
  }
  await prisma.$transaction([
    prisma.classOccurrence.updateMany({
      where: { templateId, status: 'SCHEDULED' },
      data: { instructorId },
    }),
    prisma.classSeries.updateMany({
      where: { templateId, isActive: true },
      data: { instructorId },
    }),
  ]);
  revalidatePath(`/admin/classes/${templateId}`);
  revalidatePath('/admin/classes');
  revalidatePath('/admin/events');
  revalidatePath('/admin/instructors');
  revalidatePath('/schedule');
  revalidatePath('/instructor/schedule');
  redirect(`/admin/classes/${templateId}?saved=instructor`);
}
