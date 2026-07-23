'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export async function updateOccurrenceAction(formData: FormData) {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  const current = await prisma.classOccurrence.findUnique({ where: { id }, include: { template: true } });
  if (!current) return;
  const startAt = new Date(String(formData.get('startAt') || ''));
  const endAt = new Date(startAt.getTime() + current.template.durationMinutes * 60_000);
  await prisma.classOccurrence.update({
    where: { id },
    data: {
      instructorId: String(formData.get('instructorId') || '') || null,
      roomId: String(formData.get('roomId') || '') || null,
      startAt,
      endAt,
      capacity: Math.max(1, Number(formData.get('capacity') || current.capacity)),
      publicNotes: String(formData.get('publicNotes') || '') || null,
      internalNotes: String(formData.get('internalNotes') || '') || null,
    },
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
  const startAt = new Date(item.startAt.getTime() + 7 * 24 * 60 * 60_000);
  const copy = await prisma.classOccurrence.create({
    data: { templateId: item.templateId, instructorId: item.instructorId, roomId: item.roomId, startAt, endAt: new Date(startAt.getTime() + (item.endAt.getTime() - item.startAt.getTime())), timezone: item.timezone, capacity: item.capacity, priceCents: item.priceCents, publicNotes: item.publicNotes, internalNotes: item.internalNotes },
  });
  revalidatePath('/admin/schedule');
  redirect(`/admin/schedule/${copy.id}?saved=duplicate`);
}

export async function cancelOccurrenceAction(formData: FormData) {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  await prisma.classOccurrence.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: String(formData.get('reason') || '') || 'Cancelled by studio' } });
  revalidatePath('/admin/schedule');
  revalidatePath('/schedule');
  redirect('/admin/schedule');
}

export async function cancelSeriesAction(formData: FormData) {
  await requireArea('admin');
  const seriesId = String(formData.get('seriesId') || '');
  if (!seriesId) return;
  await prisma.$transaction([
    prisma.classSeries.update({ where: { id: seriesId }, data: { isActive: false } }),
    prisma.classOccurrence.updateMany({ where: { seriesId, startAt: { gte: new Date() } }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Series cancelled' } }),
  ]);
  revalidatePath('/admin/schedule');
  revalidatePath('/schedule');
  redirect('/admin/schedule');
}
