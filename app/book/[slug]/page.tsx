import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Calendar } from 'lucide-react';
import { classes, getClass } from '@/lib/classes';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Booking coming soon',
  robots: { index: false },
};

export function generateStaticParams() {
  return classes.map((c) => ({ slug: c.slug }));
}

// TODO: Integrate booking system (Mindbody / Arketa / Momence, TBD)
export default function BookingPlaceholder({
  params,
}: {
  params: { slug: string };
}) {
  const cls = getClass(params.slug);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-8 inline-flex rounded-2xl border border-rhyze-coral/40 bg-rhyze-coral/10 p-4">
        <Calendar className="h-8 w-8 text-rhyze-coral" aria-hidden />
      </div>
      <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
        Coming Soon
      </p>
      <h1 className="font-display text-5xl tracking-wider md:text-7xl">
        BOOKING LAUNCHES <br />
        WITH THE STUDIO
      </h1>
      <p className="mt-6 max-w-xl text-lg text-rhyze-cream/70">
        Our real-time booking system opens the day we unlock the doors. In the
        meantime, lock in your $7 trial and we&apos;ll hold a spot for you on
        opening week.
      </p>
      {cls && (
        <p className="mt-4 text-sm text-rhyze-cream/50">
          Class:{' '}
          <Link
            href={`/classes/${cls.slug}`}
            className="text-rhyze-gold hover:underline"
          >
            {cls.name}
          </Link>
        </p>
      )}
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button href="/join" size="lg">
          Start $7 Trial →
        </Button>
        <Link
          href="/classes"
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-3 text-sm font-semibold uppercase tracking-wide hover:border-rhyze-coral hover:text-rhyze-coral"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Classes
        </Link>
      </div>
    </main>
  );
}
