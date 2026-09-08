'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

const dismissNotificationSchema = z.object({
  notificationId: z.string().min(1),
});

export async function dismissAdminNotificationAction(formData: FormData) {
  const user = await requireApprovedOwner();
  const parsed = dismissNotificationSchema.safeParse({
    notificationId: formData.get('notificationId'),
  });
  if (!parsed.success) return;

  await prisma.inAppNotification.updateMany({
    where: {
      id: parsed.data.notificationId,
      userId: user.id,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  revalidatePath('/admin', 'layout');
}
