'use server';

import type { CredentialType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { putPrivateDocument } from '@/lib/storage/object-storage';
import { parseOptionalExpiration } from '@/lib/domain/credentials/credential-upload';

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
