'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { sombleScheduleUrl } from '@/lib/somble';

export function ScheduleFull() {
  const [isBookingMode, setIsBookingMode] = useState(false);
  const activateBookingMode = () => {
    window.setTimeout(() => setIsBookingMode(true), 450);
  };

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

      <div
        className={`somble-frame-shell relative overflow-hidden bg-rhyze-black transition-[height] duration-300 ${
          isBookingMode ? 'h-[1100px]' : 'h-[720px]'
        }`}
      >
        <iframe
          src={sombleScheduleUrl}
          title="Rhyze Fitness live class schedule on Somble"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          scrolling="no"
          onFocus={activateBookingMode}
          onMouseDown={activateBookingMode}
          className={`somble-frame-crop bg-rhyze-black transition-transform duration-300 ${
            isBookingMode
              ? 'h-[1100px] w-full translate-y-0'
              : 'h-[1250px] w-full -translate-y-[530px]'
          }`}
        />
      </div>
    </section>
  );
}
