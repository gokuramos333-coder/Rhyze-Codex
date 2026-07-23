'use server';

import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export async function markNotificationReadAction(formData: FormData) {
  const user = await requireArea('member');
  const id = String(formData.get('id') || '');
  await prisma.inAppNotification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
  revalidatePath('/member/notifications');
}
