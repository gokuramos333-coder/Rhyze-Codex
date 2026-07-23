'use server';

import type { CredentialStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { queueEmail } from '@/lib/notifications/email-queue';

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
    payload: { credentialId: credential.id, rejectionNote },
  });
  revalidatePath(`/admin/instructors/${credential.instructorId}`);
}
