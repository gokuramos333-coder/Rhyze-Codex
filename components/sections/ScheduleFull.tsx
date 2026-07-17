import { ExternalLink } from 'lucide-react';
import { sombleScheduleUrl } from '@/lib/somble';

export function ScheduleFull() {
  return (
    <section id="schedule" className="scroll-mt-28">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
            Live on Somble
          </p>
          <h2 className="font-display text-4xl tracking-wider md:text-6xl">
            SCHEDULE
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-rhyze-cream/65">
            Browse the current Rhyze Fitness schedule, reserve your spot, and
            manage class access directly through Somble.
          </p>
        </div>
        <a
          href={sombleScheduleUrl}
          target="_blank"
          rel="noreferrer"
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-rhyze-cream/75 hover:border-rhyze-coral hover:text-rhyze-coral"
        >
          Open Somble Schedule
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      <div className="somble-frame-shell relative h-[1180px] overflow-hidden rounded-3xl border border-rhyze-gold/30 bg-rhyze-black shadow-glow-gold">
        <div className="pointer-events-none absolute inset-0 z-10 rounded-3xl ring-1 ring-inset ring-rhyze-coral/20" />
        <iframe
          src={sombleScheduleUrl}
          title="Rhyze Fitness live class schedule on Somble"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          scrolling="no"
          className="somble-frame-crop h-[1724px] w-full -translate-y-[544px] bg-white"
        />
      </div>
    </section>
  );
}
