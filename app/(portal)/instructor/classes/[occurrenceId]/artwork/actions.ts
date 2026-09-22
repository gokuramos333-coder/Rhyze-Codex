'use server';

import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { assignableInstructorWhere } from '@/lib/admin/assignable-instructors';
import { artworkImageFromForm, type ArtworkResult } from '@/lib/domain/schedule/artwork-upload';
import { revalidateArtwork } from '@/lib/domain/schedule/revalidate-artwork';

export async function updateOccurrenceArtworkAction(formData: FormData): Promise<ArtworkResult> {
  const user = await requireArea('instructor');
  const instructor = await prisma.user.findFirst({
    where: { ...assignableInstructorWhere, id: user.id, instructorProfile: { is: { isActive: true } } },
    select: { id: true },
  });
  if (!instructor) {
    return { error: 'Only active, approved instructors can manage class artwork.' };
  }
  const id = String(formData.get('id') || '');
  const where = { id, instructorId: user.id };
  const occurrence = await prisma.classOccurrence.findFirst({ where, select: { id: true } });
  if (!occurrence) return { error: 'You can only manage artwork for your assigned class or event.' };
  try {
    const imageUrl = await artworkImageFromForm(formData);
    const result = await prisma.classOccurrence.updateMany({ where, data: { imageUrl } });
    if (result.count !== 1) return { error: 'The assignment changed. Refresh and try again.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The artwork could not be saved.' };
  }
  revalidateArtwork();
  return { success: true };
}
