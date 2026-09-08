import { describe, expect, it } from 'vitest';
import {
  defaultClassGalleryImages,
  orderedActiveGalleryImages,
} from '@/lib/classes/class-gallery';

describe('class gallery data', () => {
  it('ships the supplied photos in the requested order', () => {
    expect(defaultClassGalleryImages).toHaveLength(17);
    expect(defaultClassGalleryImages[0]?.imageUrl).toBe(
      '/classes-slideshow/slide-09.jpg',
    );
  });

  it('returns only active images ordered by position', () => {
    expect(
      orderedActiveGalleryImages([
        { id: 'later', imageUrl: '/later.jpg', altText: 'Later', position: 8, isActive: true },
        { id: 'hidden', imageUrl: '/hidden.jpg', altText: 'Hidden', position: 0, isActive: false },
        { id: 'first', imageUrl: '/first.jpg', altText: 'First', position: 2, isActive: true },
      ]),
    ).toEqual([
      { id: 'first', imageUrl: '/first.jpg', altText: 'First', position: 2 },
      { id: 'later', imageUrl: '/later.jpg', altText: 'Later', position: 8 },
    ]);
  });
});
