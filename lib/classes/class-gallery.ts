import { prisma } from '@/lib/db/prisma';

export type ClassGalleryImageItem = {
  id: string;
  imageUrl: string;
  altText: string;
  position: number;
};

type StoredClassGalleryImage = ClassGalleryImageItem & { isActive: boolean };

const requestedSlideOrder = [9, 11, 13, 16, 1, 2, 4, 7, 17, 10, 15, 5, 6, 14, 3, 8, 12];

export const defaultClassGalleryImages: ClassGalleryImageItem[] =
  requestedSlideOrder.map((number, position) => ({
    id: `class-gallery-seed-${String(number).padStart(2, '0')}`,
    imageUrl: `/classes-slideshow/slide-${String(number).padStart(2, '0')}.jpg`,
    altText: `Rhyze Fitness class community photo ${position + 1}`,
    position,
  }));

export function orderedActiveGalleryImages(images: StoredClassGalleryImage[]) {
  return images
    .filter((image) => image.isActive)
    .sort((left, right) => left.position - right.position)
    .map(({ isActive: _isActive, ...image }) => image);
}

export async function loadClassGalleryImages() {
  const images = await prisma.classGalleryImage.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' },
  });
  return images.length
    ? images.map(({ id, imageUrl, altText, position }) => ({ id, imageUrl, altText, position }))
    : defaultClassGalleryImages;
}
