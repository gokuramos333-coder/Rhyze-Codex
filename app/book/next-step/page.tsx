import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getClass } from '@/lib/classes';
import { getOwnedEvent } from '@/lib/rhyze-platform';

export const metadata: Metadata = {
  title: 'Booking next step',
  robots: { index: false },
};

export default function BookingNextStepPage({
  searchParams,
}: {
  searchParams: { type?: string; slug?: string };
}) {
  const isEvent = searchParams.type === 'event';
  const item = isEvent
    ? getOwnedEvent(searchParams.slug ?? '')
    : getClass(searchParams.slug ?? '');
  const name = item?.name ?? (isEvent ? 'this event' : 'this class');

  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-rhyze-gold" aria-hidden />
      <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Account ready
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">
        ONE MORE STEP
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-lg text-rhyze-cream/70">
        Online inventory for {name} is not available yet. Send Rhyze a quick
        reservation request and the studio will confirm availability and payment
        details.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button
          href={`/contact?subject=${isEvent ? 'private-event' : 'general'}`}
        >
          Request This Spot
        </Button>
        <Button href={isEvent ? '/events' : '/schedule'} variant="outline">
          View {isEvent ? 'Events' : 'Schedule'}
        </Button>
      </div>
    </main>
  );
}
