'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export async function updateClassTemplateAction(formData: FormData) {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  await prisma.classTemplate.update({
    where: { id },
    data: {
      name: String(formData.get('name') || '').trim(),
      categoryId: String(formData.get('categoryId') || ''),
      description: String(formData.get('description') || '').trim(),
      imageUrl: String(formData.get('imageUrl') || '') || null,
      durationMinutes: Number(formData.get('durationMinutes')),
      defaultCapacity: Number(formData.get('defaultCapacity')),
      dropInPriceCents: Math.round(Number(formData.get('dropInPrice')) * 100),
      intensity: String(formData.get('intensity') || 'ALL_LEVELS') as 'LOW' | 'MODERATE' | 'HIGH' | 'ALL_LEVELS',
      tags: String(formData.get('tags') || '').split(',').map((item) => item.trim()).filter(Boolean),
      equipment: String(formData.get('equipment') || '').split(',').map((item) => item.trim()).filter(Boolean),
      cancellationPolicy: String(formData.get('cancellationPolicy') || '') || null,
      isActive: formData.get('isActive') === 'on',
      archivedAt: formData.get('isActive') === 'on' ? null : new Date(),
    },
  });
  revalidatePath('/admin/classes');
  revalidatePath('/schedule');
  redirect(`/admin/classes/${id}?saved=1`);
}
