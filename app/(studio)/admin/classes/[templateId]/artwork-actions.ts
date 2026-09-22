'use server';

import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { artworkImageFromForm, type ArtworkResult } from '@/lib/domain/schedule/artwork-upload';
import { revalidateArtwork } from '@/lib/domain/schedule/revalidate-artwork';

export async function updateTemplateArtworkAction(formData: FormData): Promise<ArtworkResult> {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  const current = await prisma.classTemplate.findUnique({ where: { id }, select: { id: true } });
  if (!current) return { error: 'Class or event not found.' };
  try {
    const imageUrl = await artworkImageFromForm(formData);
    // Removing/replacing the reference must not delete media used elsewhere.
    await prisma.classTemplate.update({ where: { id }, data: { imageUrl } });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The artwork could not be saved.' };
  }
  revalidateArtwork();
  return { success: true };
}
