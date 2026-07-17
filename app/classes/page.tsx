import type { Metadata } from 'next';
import Image from 'next/image';
import { ClassList } from '@/components/sections/ClassList';
import { ScheduleFull } from '@/components/sections/ScheduleFull';
import { Badge } from '@/components/ui/Badge';
import { levelColor, levelLabel } from '@/lib/classes';

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
          Thirteen official formats across three pillars, Dance, Yoga &
          Pilates, and Strength & HIIT, matched to the current Rhyze Fitness
          class schedule on Somble.
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

      <section id="levels" className="mb-20 scroll-mt-28">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          Level Guide
        </p>
        <h2 className="mb-8 font-display text-4xl tracking-wider md:text-6xl">
          KNOW YOUR RHYTHM
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(['foundation', 'signature', 'peak'] as const).map((l) => (
            <div
              key={l}
              className="rounded-2xl border border-white/10 bg-rhyze-charcoal p-6"
            >
              <Badge className={levelColor[l]}>{levelLabel[l]}</Badge>
              <h3 className="mt-4 font-display text-2xl tracking-wider">
                {l === 'foundation' && 'Level 1'}
                {l === 'signature' && 'Level 2'}
                {l === 'peak' && 'Level 3'}
              </h3>
              <p className="mt-2 text-sm text-rhyze-cream/70">
                {l === 'foundation' &&
                  'Approachable, welcoming, and built for first-timers or those easing back in.'}
                {l === 'signature' &&
                  'Our core experiences, challenging, energetic, and open to all levels.'}
                {l === 'peak' &&
                  'High-intensity, technical, or advanced programming for seasoned Rhyzers.'}
              </p>
            </div>
          ))}
        </div>
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

      <ScheduleFull />
    </main>
  );
}
