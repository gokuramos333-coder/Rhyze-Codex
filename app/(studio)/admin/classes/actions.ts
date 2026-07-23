'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { hasScheduleConflict } from '@/lib/domain/schedule/conflict-service';
import { expandWeeklyRecurrence } from '@/lib/domain/schedule/recurrence-service';

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export async function createClassTemplateAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireArea('admin');
  const name = String(formData.get('name') || '').trim();
  const categoryId = String(formData.get('categoryId') || '');
  const description = String(formData.get('description') || '').trim();
  const durationMinutes = Number(formData.get('durationMinutes'));
  const defaultCapacity = Number(formData.get('defaultCapacity'));
  const dropInPriceCents = Math.round(
    Number(formData.get('dropInPrice')) * 100,
  );

  if (
    !name ||
    !categoryId ||
    !description ||
    durationMinutes < 15 ||
    defaultCapacity < 1
  ) {
    redirect('/admin/classes?error=invalid');
  }

  const template = await prisma.classTemplate.create({
    data: {
      name,
      slug: `${slugify(name)}-${Date.now().toString(36)}`,
      categoryId,
      description,
      durationMinutes,
      defaultCapacity,
      dropInPriceCents,
      intensity: 'ALL_LEVELS',
      tags: [],
      equipment: [],
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: 'class-template.created',
      entityType: 'ClassTemplate',
      entityId: template.id,
    },
  });

  revalidatePath('/admin/classes');
  revalidatePath('/schedule');
  redirect('/admin/classes?saved=1');
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

export async function createOccurrenceAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireArea('admin');
  const templateId = String(formData.get('templateId') || '');
  const instructorId = String(formData.get('instructorId') || '') || null;
  const roomId = String(formData.get('roomId') || '') || null;
  const startAt = new Date(String(formData.get('startAt') || ''));
  const template = await prisma.classTemplate.findUnique({
    where: { id: templateId },
  });
  if (!template || Number.isNaN(startAt.getTime())) {
    redirect('/admin/schedule?error=invalid');
  }
  const endAt = new Date(
    startAt.getTime() + template.durationMinutes * 60 * 1000,
  );

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

  const occurrence = await prisma.classOccurrence.create({
    data: {
      templateId,
      instructorId,
      roomId,
      startAt,
      endAt,
      capacity: template.defaultCapacity,
      priceCents: template.dropInPriceCents,
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
  const roomId = String(formData.get('roomId') || '') || null;
  const startLocal = String(formData.get('startAt') || '');
  const count = Math.min(52, Math.max(2, Number(formData.get('count') || 4)));
  const timezone = 'America/New_York';
  const template = await prisma.classTemplate.findUnique({ where: { id: templateId } });
  if (!template) redirect('/admin/schedule?error=invalid');
  const starts = expandWeeklyRecurrence({ startLocal, timezone, intervalWeeks: 1, count });
  const ends = starts.map((startAt) => new Date(startAt.getTime() + template.durationMinutes * 60_000));
  const conflicts = await prisma.classOccurrence.findMany({
    where: { status: 'SCHEDULED', OR: [...(instructorId ? [{ instructorId }] : []), ...(roomId ? [{ roomId }] : [])] },
    select: { startAt: true, endAt: true },
  });
  if (starts.some((startAt, index) => conflicts.some((item) => hasScheduleConflict(item, { startAt, endAt: ends[index] })))) {
    redirect('/admin/schedule?error=conflict');
  }
  const series = await prisma.classSeries.create({
    data: { templateId, instructorId, roomId, timezone, recurrenceRule: `FREQ=WEEKLY;COUNT=${count}`, startsAt: starts[0] },
  });
  await prisma.$transaction([
    ...starts.map((startAt, index) => prisma.classOccurrence.create({
      data: { templateId, seriesId: series.id, instructorId, roomId, startAt, endAt: ends[index], timezone, capacity: template.defaultCapacity, priceCents: template.dropInPriceCents },
    })),
    prisma.auditLog.create({ data: { actorId: actor.id, action: `class-series.created:${count}`, entityType: 'ClassSeries', entityId: series.id } }),
  ]);
  revalidatePath('/admin/schedule');
  revalidatePath('/schedule');
  redirect('/admin/schedule?saved=series');
}
