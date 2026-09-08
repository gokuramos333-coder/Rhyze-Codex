import type { Metadata } from 'next';
import { EventsPreview } from '@/components/sections/EventsPreview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Events',
  description:
    'Upcoming Rhyze Fitness specialty classes, workshops, and event booking.',
};

export default function EventsPage() {
  return (
    <main className="py-20">
      <section className="mx-auto max-w-7xl px-6 text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          Specialty Classes
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          EVENTS
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/70">
          Special events are separate from standard memberships unless they are
          listed as an eligible VIP monthly choice.
        </p>
      </section>

      <EventsPreview heading="EVENTS BY DATE" showIntro={false} />
    </main>
  );
}
