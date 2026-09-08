'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ClassGalleryImageItem } from '@/lib/classes/class-gallery';
import {
  addClassGalleryImageAction,
  removeClassGalleryImageAction,
  reorderClassGalleryImagesAction,
} from '@/app/(studio)/admin/classes/actions';

export function ClassGalleryManager({ images }: { images: ClassGalleryImageItem[] }) {
  const [ordered, setOrdered] = useState(images);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const visibleImages = expanded ? ordered : ordered.slice(0, 4);

  function moveBefore(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setOrdered((current) => {
      const dragged = current.find((image) => image.id === draggedId);
      if (!dragged) return current;
      return current.reduce<ClassGalleryImageItem[]>((result, image) => {
        if (image.id === draggedId) return result;
        if (image.id === targetId) result.push(dragged);
        result.push(image);
        return result;
      }, []);
    });
  }

  return (
    <section
      id="slideshow-photos"
      className="mt-8 scroll-mt-8 border-t-4 border-rhyze-gold bg-white p-6"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-rhyze-coral">Public classes slideshow</p>
          <h2 className="mt-2 font-display text-4xl tracking-wider">SLIDESHOW PHOTOS</h2>
          <p className="mt-2 max-w-2xl text-sm text-rhyze-black/55">Drag photos into the public order, then save. Removing a photo hides it without deleting the original file.</p>
        </div>
        <form action={reorderClassGalleryImagesAction}>
          <input type="hidden" name="orderedIds" value={ordered.map((image) => image.id).join(',')} />
          <button className="min-h-11 bg-rhyze-black px-5 text-xs font-black uppercase tracking-widest text-white">Save photo order</button>
        </form>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visibleImages.map((image, index) => (
          <article
            key={image.id}
            draggable
            onDragStart={() => setDraggedId(image.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => moveBefore(image.id)}
            className={`border bg-orange-50 p-3 transition ${draggedId === image.id ? 'opacity-45' : 'border-rhyze-orange/25'}`}
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-rhyze-black">
              <Image
                src={image.imageUrl}
                alt={image.altText}
                fill
                unoptimized={image.imageUrl.startsWith('/api/media/')}
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                className="object-cover"
              />
              <span className="absolute left-2 top-2 bg-rhyze-black/80 px-2 py-1 text-[10px] font-black text-white">{index + 1}</span>
            </div>
            <p className="mt-2 truncate text-xs font-bold">{image.altText}</p>
            <form action={removeClassGalleryImageAction} className="mt-3">
              <input type="hidden" name="imageId" value={image.id} />
              <button className="border border-red-700 bg-red-100 px-3 py-2 text-[10px] font-black uppercase text-red-900">Remove</button>
            </form>
          </article>
        ))}
      </div>
      {ordered.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-4 border border-rhyze-black px-4 py-2 text-xs font-black uppercase tracking-widest"
        >
          {expanded ? 'Show less' : `Load more (${ordered.length - 4})`}
        </button>
      )}

      <form action={addClassGalleryImageAction} className="mt-6 grid gap-3 border border-rhyze-orange/30 bg-orange-50 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="grid gap-2 text-xs font-black uppercase tracking-widest">
          Upload photo
          <input name="image" type="file" accept="image/jpeg,image/png" required className="min-h-12 border bg-white p-3 text-sm font-normal normal-case tracking-normal" />
        </label>
        <label className="grid gap-2 text-xs font-black uppercase tracking-widest">
          Photo description
          <input name="altText" required maxLength={160} placeholder="Example: Rhyze dance class moving together" className="min-h-12 border bg-white px-3 text-sm font-normal normal-case tracking-normal" />
        </label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest">Add photo</button>
      </form>
    </section>
  );
}
