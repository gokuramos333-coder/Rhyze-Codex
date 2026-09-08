import { ClassGalleryManager } from '@/components/admin/ClassGalleryManager';
import { loadClassGalleryImages } from '@/lib/classes/class-gallery';

export default async function AdminSlideshowPage() {
  const images = await loadClassGalleryImages();

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Classes
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">
        SLIDESHOW
      </h1>
      <p className="mt-3 max-w-2xl text-sm font-bold text-rhyze-black/55">
        Manage the photos displayed in the public Classes slideshow.
      </p>
      <ClassGalleryManager images={images} />
    </>
  );
}
