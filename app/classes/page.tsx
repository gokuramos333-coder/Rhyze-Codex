import type { Metadata } from 'next';
import { ClassList } from '@/components/sections/ClassList';
import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar';
import { ClassGallerySlideshow } from '@/components/sections/ClassGallerySlideshow';
import { prisma } from '@/lib/db/prisma';
import type { ClassCategory } from '@/lib/classes';
import { loadPublicScheduleSlots } from '@/lib/domain/schedule/public-schedule-query';
import { loadClassGalleryImages } from '@/lib/classes/class-gallery';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Classes & Schedule',
  description:
    'Browse the Rhyze Fitness class catalog, Dance, Yoga & Pilates, Strength & HIIT, and book your spot on the floor.',
};

export default async function ClassesPage() {
  const [templates, slots, galleryImages] = await Promise.all([
    prisma.classTemplate.findMany({
      where: { isActive: true, archivedAt: null, isEvent: false },
      include: { category: true },
      orderBy: { name: 'asc' },
    }),
    loadPublicScheduleSlots(),
    loadClassGalleryImages(),
  ]);
  const catalog = templates.map((item) => ({
    slug: item.slug,
    name: item.name,
    category: (['dance', 'yoga', 'strength'].includes(item.category.slug) ? item.category.slug : 'dance') as ClassCategory,
    duration: item.durationMinutes,
    tagline: item.description.split(/[.!?]/)[0] || item.name,
    description: item.description,
    whatToExpect: item.tags.length ? item.tags : [item.description],
  }));
  return (
    <main className="mx-auto max-w-7xl px-6 py-20">
      <section className="mb-20 text-left md:text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          The Floor
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          CLASSES
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/70">
          {catalog.length} official formats across three pillars, Dance, Yoga &
          Pilates, and Strength & HIIT, matched to Rhyze-managed booking,
          capacity, waitlists, and member credits.
        </p>
        <ClassGallerySlideshow images={galleryImages} />
      </section>

      <section id="schedule" className="mb-24 scroll-mt-44">
        <div className="mb-8 text-left md:text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-orange">
            Live schedule
          </p>
          <h2 className="mt-3 font-display text-5xl tracking-wider md:text-7xl">
            CHOOSE YOUR DAY
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-rhyze-cream/65">
            Browse daily, weekly, or monthly, then open any class to book.
          </p>
        </div>
        <WeeklyCalendar slots={slots} />
      </section>

      <section id="dance" className="mb-20 scroll-mt-28">
        <ClassList catalog={catalog} />
      </section>

      <section className="mb-10 scroll-mt-28" id="yoga">
        {/* Anchor target only, list is shared */}
      </section>
      <section className="mb-10 scroll-mt-28" id="strength">
        {/* Anchor target only, list is shared */}
      </section>
    </main>
  );
}
