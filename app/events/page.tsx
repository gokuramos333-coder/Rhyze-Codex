import type { Metadata } from 'next';
import { EventsPreview } from '@/components/sections/EventsPreview';

export const metadata: Metadata = {
  alternates: { canonical: '/events' },
  title: 'Events',
  description:
    'Upcoming Rhyze Fitness specialty classes, workshops, and event booking.',
};

export const dynamic = 'force-dynamic';

export default function EventsPage() {
  return (
    <main className="py-20">
      <section className="mx-auto max-w-7xl px-6 text-left md:text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          Specialty Classes
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          EVENTS
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/70">
          Check each event for pricing and member access. Rachel’s Soul Line
          Dancing accepts eligible class credits and VIP unlimited access.
          Other events keep their specialty pricing and eligible event-credit rules.
        </p>
      </section>

      <EventsPreview
        heading="EVENTS BY DATE"
        showIntro={false}
        showAllLink={false}
      />
    </main>
  );
}
