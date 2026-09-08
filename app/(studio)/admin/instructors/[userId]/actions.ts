'use server';

import type { CredentialStatus, CredentialType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { queueEmail } from '@/lib/notifications/email-queue';
import { putPrivateDocument } from '@/lib/storage/object-storage';
import { parseOptionalExpiration } from '@/lib/domain/credentials/credential-upload';

export async function reviewCredentialAction(formData: FormData) {
  const actor = await requireArea('admin');
  const id = String(formData.get('credentialId') || '');
  const status = String(formData.get('status') || '') as CredentialStatus;
  const rejectionNote = String(formData.get('rejectionNote') || '').trim() || null;
  if (!['VALID','REJECTED'].includes(status)) return;
  const credential = await prisma.instructorCredential.update({
    where: { id },
    data: { status, rejectionNote: status === 'REJECTED' ? rejectionNote : null, reviewedById: actor.id, reviewedAt: new Date() },
    include: { instructor: true },
  });
  await queueEmail(prisma, {
    userId: credential.instructorId,
    to: credential.instructor.email,
    subject: `Your ${credential.type === 'CPR' ? 'CPR certification' : 'insurance'} was ${status === 'VALID' ? 'approved' : 'rejected'}`,
    template: `CREDENTIAL_${status}`,
    payload: {
      name: credential.instructor.name || 'Instructor',
      credentialName: credential.type === 'CPR' ? 'CPR certification' : 'instructor insurance',
      rejectionNote,
      profileUrl: '/instructor/profile',
    },
    dedupeKey: `credential-review:${credential.id}:${status}`,
  });
  revalidatePath(`/admin/instructors/${credential.instructorId}`);
}

export async function adminUploadCredentialAction(formData: FormData) {
  await requireArea('admin');
  const instructorId = String(formData.get('instructorId') || '');
  const type = String(formData.get('type') || '') as CredentialType;
  const file = formData.get('document');
  let expiresAt: Date | null;

  try {
    expiresAt = parseOptionalExpiration(formData.get('expiresAt'));
  } catch {
    redirect(`/admin/instructors/${instructorId}?error=document#credential-upload`);
  }
  if (
    !instructorId ||
    !['INSURANCE', 'CPR'].includes(type) ||
    !(file instanceof File) ||
    !file.size
  ) {
    redirect(`/admin/instructors/${instructorId}?error=document#credential-upload`);
  }

  const instructor = await prisma.user.findFirst({
    where: { id: instructorId, instructorProfile: { isNot: null } },
    select: { id: true },
  });
  if (!instructor) redirect('/admin/instructors?error=not-found');

  let storageKey: string;
  try {
    storageKey = await putPrivateDocument(file);
  } catch {
    redirect(`/admin/instructors/${instructorId}?error=document#credential-upload`);
  }

  await prisma.instructorCredential.create({
    data: {
      instructorId,
      type,
      storageKey,
      originalFilename: file.name,
      contentType: file.type,
      expiresAt,
    },
  });
  revalidatePath(`/admin/instructors/${instructorId}`);
  revalidatePath('/instructor/profile');
  redirect(`/admin/instructors/${instructorId}?saved=credential#credential-upload`);
}
