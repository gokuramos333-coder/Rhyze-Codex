import type { Metadata } from 'next';
import { instructors } from '@/lib/instructors';
import { InstructorCard } from '@/components/sections/InstructorCard';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Instructors',
  description:
    'Meet the dance, yoga, strength, and fitness instructors of Rhyze Fitness in Lafayette, NJ.',
};

export default function InstructorsPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-20">
      <section className="mb-16 text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          The Team
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          YOUR <span className="rhyze-gradient-text">RHYZE</span> CREW
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/75">
          Meet the instructors bringing dance, yoga, strength, and high-energy
          movement to the Rhyze floor.
        </p>
      </section>

      <div className="flex flex-col gap-10">
        {instructors.map((i, idx) => (
          <InstructorCard key={i.slug} instructor={i} reverse={idx % 2 === 1} />
        ))}
      </div>

      <section className="mt-20 rounded-3xl border border-white/10 bg-rhyze-charcoal p-10 text-center">
        <h2 className="font-display text-4xl tracking-wider md:text-5xl">
          JOIN THE RHYZE CREW
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-rhyze-cream/70">
          We&apos;re building a roster of passionate instructors to join us on
          the floor. Think you&apos;d be a great fit for the Rhyze crew?
        </p>
        <div className="mt-8">
          <Button href="/contact" size="lg">
            Teach With Us →
          </Button>
        </div>
      </section>
    </main>
  );
}
