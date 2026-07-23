import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ClassList } from '@/components/sections/ClassList';

export const metadata: Metadata = {
  title: 'Classes & Schedule',
  description:
    'Browse the Rhyze Fitness class catalog, Dance, Yoga & Pilates, Strength & HIIT, and book your spot on the floor.',
};

export default function ClassesPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-20">
      <section className="mb-20 text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          The Floor
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          CLASSES
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/70">
          Seventeen official formats across three pillars, Dance, Yoga &
          Pilates, and Strength & HIIT, matched to Rhyze-managed booking,
          capacity, waitlists, and member credits.
        </p>
        <div className="relative mx-auto mt-12 aspect-[16/9] max-w-5xl overflow-hidden rounded-3xl">
          <Image
            src="/founders/classes.jpg"
            alt="Inside a Rhyze Fitness class"
            fill
            sizes="(max-width: 1024px) 100vw, 64rem"
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-rhyze-black/60 via-transparent to-transparent" />
        </div>
      </section>

      <section className="mb-20 border-y border-white/10 py-10 text-center">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-orange">
          Live schedule
        </p>
        <h2 className="mt-3 font-display text-5xl tracking-wider">
          READY TO TAKE THE FLOOR?
        </h2>
        <Link
          href="/schedule"
          className="focus-ring mt-6 inline-block bg-rhyze-gradient px-7 py-4 text-xs font-black uppercase tracking-widest text-rhyze-black"
        >
          View live schedule
        </Link>
      </section>

      <section id="dance" className="mb-20 scroll-mt-28">
        <ClassList />
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
