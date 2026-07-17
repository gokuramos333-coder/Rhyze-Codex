import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, ExternalLink } from 'lucide-react';
import {
  categoryLabel,
  classes,
  getClass,
  levelColor,
  levelLabel,
} from '@/lib/classes';
import { sombleScheduleUrl } from '@/lib/somble';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export function generateStaticParams() {
  return classes.map((c) => ({ slug: c.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const c = getClass(params.slug);
  if (!c) return { title: 'Class not found' };
  return { title: c.name, description: c.tagline };
}

export default function ClassDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const c = getClass(params.slug);
  if (!c) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <Link
        href="/classes"
        className="focus-ring mb-10 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-rhyze-cream/60 hover:text-rhyze-coral"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All Classes
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge className="border-white/10 bg-rhyze-black/50 text-rhyze-cream/70">
          {categoryLabel[c.category]}
        </Badge>
        <Badge className={levelColor[c.level]}>{levelLabel[c.level]}</Badge>
        <Badge className="border-white/10 bg-rhyze-black/50 text-rhyze-cream/70">
          <Clock className="mr-1 h-3 w-3" aria-hidden />
          {c.duration} min
        </Badge>
      </div>

      <h1 className="font-display text-6xl leading-none tracking-wider md:text-8xl">
        {c.name.toUpperCase()}
      </h1>
      <p className="mt-4 text-xl italic text-rhyze-gold">{c.tagline}</p>
      <p className="mt-8 max-w-3xl text-lg leading-relaxed text-rhyze-cream/80">
        {c.description}
      </p>

      <div className="mt-14 grid gap-8 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-rhyze-charcoal p-6">
          <h2 className="mb-4 font-display text-2xl tracking-wider">
            WHAT TO EXPECT
          </h2>
          <ul className="space-y-2 text-sm text-rhyze-cream/80">
            {c.whatToExpect.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rhyze-coral" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-rhyze-charcoal p-6">
          <h2 className="mb-4 font-display text-2xl tracking-wider">
            WHAT TO BRING
          </h2>
          <ul className="space-y-2 text-sm text-rhyze-cream/80">
            {c.whatToBring.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rhyze-gold" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-14">
        <h2 className="mb-4 font-display text-2xl tracking-wider">
          LIVE TIMES & BOOKING
        </h2>
        <p className="max-w-2xl text-rhyze-cream/80">
          Class times, instructor assignments, availability, and reservations
          are managed live through Somble.
        </p>
      </div>

      <div className="mt-16 flex flex-wrap gap-3">
        <Button
          href={sombleScheduleUrl}
          size="lg"
          target="_blank"
          rel="noreferrer"
        >
          Book on Somble <ExternalLink className="h-4 w-4" aria-hidden />
        </Button>
        <Button href="/join" size="lg" variant="outline">
          New? Start $7 Trial
        </Button>
      </div>
    </main>
  );
}
