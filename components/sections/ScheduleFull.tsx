'use client';

import { useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { sombleScheduleUrl } from '@/lib/somble';

export function ScheduleFull() {
  const [isBookingMode, setIsBookingMode] = useState(false);
  const activateBookingMode = () => {
    setIsBookingMode(true);
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
        onMouseEnter={activateBookingMode}
        onTouchStart={activateBookingMode}
        className={`somble-frame-shell relative overflow-hidden bg-rhyze-black transition-[height] duration-300 ${
          isBookingMode ? 'fixed inset-0 z-[100] h-[100dvh]' : 'h-[720px]'
        }`}
      >
        {isBookingMode && (
          <button
            type="button"
            onClick={() => setIsBookingMode(false)}
            className="focus-ring absolute bottom-5 right-5 z-10 inline-flex items-center gap-2 rounded-full border border-white/15 bg-rhyze-black/85 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-rhyze-cream shadow-2xl backdrop-blur hover:border-rhyze-coral hover:text-rhyze-coral"
          >
            Exit full screen
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
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
              ? 'h-full w-full translate-y-0'
              : 'h-[1250px] w-full -translate-y-[530px]'
          }`}
        />
      </div>
    </section>
  );
}
