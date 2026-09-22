import { validatePublicImageMetadata } from '@/lib/storage/public-image';
import { putPublicImage } from '@/lib/storage/object-storage';

export type ArtworkResult = { success: true } | { error: string };

export async function artworkImageFromForm(formData: FormData) {
  if (formData.get('removePhoto') === 'true') return null;
  const photo = formData.get('photo');
  if (!(photo instanceof File) || !photo.size) {
    throw new Error('Choose a photo before saving.');
  }
  const validation = validatePublicImageMetadata(photo);
  if (!validation.valid) throw new Error(validation.error);
  try {
    return await putPublicImage(photo);
  } catch {
    throw new Error('The photo could not be uploaded. Try a valid JPG, PNG, WebP, or HEIC photo.');
  }
}
