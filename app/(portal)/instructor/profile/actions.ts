'use server';

import type { CredentialType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import {
  deleteObject,
  putPrivateDocument,
  putPublicImage,
} from '@/lib/storage/object-storage';
import { parseOptionalExpiration } from '@/lib/domain/credentials/credential-upload';
import { birthdayDateFromMonthDay } from '@/lib/domain/birthdays/birthday-reminders';

export async function updateOwnInstructorDirectoryAction(formData: FormData) {
  const user = await requireArea('instructor');
  const name = String(formData.get('name') || '').trim();
  const bio = String(formData.get('bio') || '').trim();
  const photo = formData.get('photo');
  const removePhoto = formData.get('removePhoto') === 'true';
  if (!name) redirect('/instructor/profile?error=profile');

  const current = await prisma.instructorProfile.findUnique({
    where: { userId: user.id },
    select: { photoUrl: true, canEditOwnProfile: true },
  });
  if (!current?.canEditOwnProfile) {
    redirect('/instructor/profile?error=profile-access');
  }

  let nextPhotoUrl = removePhoto ? null : current.photoUrl;
  if (photo instanceof File && photo.size > 0) {
    try {
      nextPhotoUrl = await putPublicImage(photo);
    } catch {
      redirect('/instructor/profile?error=photo');
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      image: nextPhotoUrl,
      instructorProfile: {
        update: { bio, photoUrl: nextPhotoUrl },
      },
    },
  });
  if (
    nextPhotoUrl !== current.photoUrl &&
    (current.photoUrl?.startsWith('/uploads/profiles/') ||
      current.photoUrl?.startsWith('/api/media/'))
  ) {
    await deleteObject(current.photoUrl);
  }
  revalidatePath('/instructor/profile');
  revalidatePath(`/admin/instructors/${user.id}`);
  revalidatePath('/admin/instructors');
  revalidatePath('/instructors');
  redirect('/instructor/profile?saved=profile');
}

export async function updateInstructorBirthdayAction(formData: FormData) {
  const user = await requireArea('instructor');
  let dateOfBirth: Date;
  try {
    dateOfBirth = birthdayDateFromMonthDay(
      Number(formData.get('birthdayMonth')),
      Number(formData.get('birthdayDay')),
    );
  } catch {
    redirect('/instructor/profile?error=birthday');
  }
  await prisma.memberProfile.upsert({
    where: { userId: user.id },
    update: { dateOfBirth },
    create: { userId: user.id, dateOfBirth },
  });
  revalidatePath('/instructor/profile');
  redirect('/instructor/profile?saved=birthday');
}

export async function uploadCredentialAction(formData: FormData) {
  const user = await requireArea('instructor');
  const file = formData.get('document');
  const type = String(formData.get('type') || '') as CredentialType;
  let expiresAt: Date | null;
  try {
    expiresAt = parseOptionalExpiration(formData.get('expiresAt'));
  } catch {
    redirect('/instructor/profile?error=document');
  }
  if (!(file instanceof File) || !file.size || !['INSURANCE','CPR'].includes(type)) {
    redirect('/instructor/profile?error=document');
  }
  let storageKey: string;
  try { storageKey = await putPrivateDocument(file); } catch { redirect('/instructor/profile?error=document'); }
  await prisma.instructorCredential.create({
    data: { instructorId: user.id, type, storageKey, originalFilename: file.name, contentType: file.type, expiresAt },
  });
  revalidatePath('/instructor/profile');
  redirect('/instructor/profile?saved=document');
}
