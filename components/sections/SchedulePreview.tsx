import Link from 'next/link';
import { ArrowRight, CalendarDays, ExternalLink, Sparkles } from 'lucide-react';
import { sombleScheduleUrl } from '@/lib/somble';

const liveScheduleNotes = [
  {
    icon: CalendarDays,
    title: 'Current class times',
    body: 'Somble shows the live Rhyze Fitness calendar as classes are added.',
  },
  {
    icon: Sparkles,
    title: 'Real booking flow',
    body: 'Reserve your spot, view class access, and manage your schedule there.',
  },
  {
    icon: ExternalLink,
    title: 'Opens on Somble',
    body: 'If the embedded schedule ever needs more room, open it directly.',
  },
];

export function SchedulePreview() {
  return (
    <section className="border-y border-white/5 bg-rhyze-charcoal/30 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
              This Week
            </p>
            <h2 className="font-display text-5xl tracking-wider md:text-7xl">
              ON THE FLOOR
            </h2>
            <p className="mt-4 max-w-2xl text-rhyze-cream/65">
              The live class calendar now lives on Somble, so the website stays
              matched with the actual booking schedule.
            </p>
          </div>
          <Link
            href="/classes#schedule"
            className="focus-ring group inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold uppercase tracking-wide hover:border-rhyze-coral hover:text-rhyze-coral"
          >
            View full schedule{' '}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {liveScheduleNotes.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-rhyze-black/50 p-6"
            >
              <div className="mb-5 inline-flex rounded-2xl border border-rhyze-coral/30 bg-rhyze-coral/10 p-3 text-rhyze-coral">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="font-display text-2xl tracking-wider">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-rhyze-cream/65">
                {body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <a
            href={sombleScheduleUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex items-center gap-2 rounded-full bg-rhyze-gradient px-6 py-3 text-sm font-bold uppercase tracking-widest text-rhyze-black hover:shadow-glow"
          >
            Book on Somble
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
