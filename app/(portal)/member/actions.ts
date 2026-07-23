'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import {
  notificationPreferenceSchema,
  profileSchema,
} from '@/lib/validation/profile';
import { deleteObject, putPublicImage } from '@/lib/storage/object-storage';

export async function updateProfileAction(formData: FormData): Promise<void> {
  const user = await requireArea('member');
  const parsed = profileSchema.safeParse({
    preferredName: formData.get('preferredName'),
    phone: formData.get('phone'),
    addressLine1: formData.get('addressLine1'),
    addressLine2: formData.get('addressLine2'),
    city: formData.get('city'),
    region: formData.get('region'),
    postalCode: formData.get('postalCode'),
    emergencyContactName: formData.get('emergencyContactName'),
    emergencyContactPhone: formData.get('emergencyContactPhone'),
  });

  if (!parsed.success) redirect('/member/profile?error=profile');

  await prisma.$transaction([
    prisma.memberProfile.upsert({
      where: { userId: user.id },
      update: parsed.data,
      create: { userId: user.id, ...parsed.data },
    }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'member.profile.updated',
        entityType: 'MemberProfile',
        entityId: user.id,
      },
    }),
  ]);

  revalidatePath('/member/profile');
  redirect('/member/profile?saved=profile');
}

export async function updateProfilePhotoAction(formData: FormData): Promise<void> {
  const user = await requireArea('member');
  const file = formData.get('photo');
  if (!(file instanceof File) || !file.size) redirect('/member/profile?error=photo');
  let photoUrl: string;
  try { photoUrl = await putPublicImage(file); } catch { redirect('/member/profile?error=photo'); }
  const current = await prisma.memberProfile.findUnique({ where: { userId: user.id }, select: { photoUrl: true } });
  await prisma.memberProfile.upsert({ where: { userId: user.id }, update: { photoUrl }, create: { userId: user.id, photoUrl } });
  await deleteObject(current?.photoUrl || null);
  revalidatePath('/member/profile');
  redirect('/member/profile?saved=photo');
}

export async function removeProfilePhotoAction(): Promise<void> {
  const user = await requireArea('member');
  const current = await prisma.memberProfile.findUnique({ where: { userId: user.id }, select: { photoUrl: true } });
  await prisma.memberProfile.updateMany({ where: { userId: user.id }, data: { photoUrl: null } });
  await deleteObject(current?.photoUrl || null);
  revalidatePath('/member/profile');
}

export async function updateNotificationPreferencesAction(
  formData: FormData,
): Promise<void> {
  const user = await requireArea('member');
  const parsed = notificationPreferenceSchema.parse({
    classReminders: formData.get('classReminders') === 'on',
    marketingEmail: formData.get('marketingEmail') === 'on',
  });

  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    update: parsed,
    create: { userId: user.id, ...parsed },
  });

  revalidatePath('/member/profile');
  redirect('/member/profile?saved=notifications');
}

export async function acceptWaiverAction(formData: FormData): Promise<void> {
  const user = await requireArea('member');
  const waiverVersionId = String(formData.get('waiverVersionId') || '');
  const accepted = formData.get('accepted') === 'on';

  if (!waiverVersionId || !accepted) {
    redirect('/member/waiver?error=acceptance');
  }

  const waiver = await prisma.waiverVersion.findFirst({
    where: { id: waiverVersionId, isActive: true, requiresSign: true },
    select: { id: true },
  });

  if (!waiver) redirect('/member/waiver?error=version');

  const requestHeaders = headers();
  const forwardedFor = requestHeaders.get('x-forwarded-for');
  const ipAddress = forwardedFor?.split(',')[0]?.trim() || null;
  const userAgent = requestHeaders.get('user-agent');

  await prisma.$transaction([
    prisma.waiverAcceptance.upsert({
      where: {
        waiverVersionId_userId: {
          waiverVersionId: waiver.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        waiverVersionId: waiver.id,
        userId: user.id,
        ipAddress,
        userAgent,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'waiver.accepted',
        entityType: 'WaiverVersion',
        entityId: waiver.id,
        ipAddress,
        userAgent,
      },
    }),
  ]);

  revalidatePath('/member/waiver');
  redirect('/member/waiver?saved=1');
}
