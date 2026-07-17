import { ExternalLink } from 'lucide-react';
import { sombleScheduleUrl } from '@/lib/somble';

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
              {"This week's live schedule is pulled from Somble, so visitors can see dates, classes, and book directly from the home page."}
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

        <div className="somble-frame-shell relative h-[720px] overflow-hidden bg-rhyze-black">
          <iframe
            src={sombleScheduleUrl}
            title="Rhyze Fitness weekly class schedule on Somble"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            scrolling="no"
            className="somble-frame-crop h-[1250px] w-full -translate-y-[530px] bg-rhyze-black"
          />
        </div>
      </div>
    </section>
  );
}
