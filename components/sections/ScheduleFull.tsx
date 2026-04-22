import Link from 'next/link';
import { cn } from '@/lib/cn';
import {
  days,
  slotsForDay,
  statusLabel,
  statusStyles,
} from '@/lib/schedule';

export function ScheduleFull() {
  return (
    <section id="schedule" className="scroll-mt-28">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
            This Week
          </p>
          <h2 className="font-display text-4xl tracking-wider md:text-6xl">
            SCHEDULE
          </h2>
        </div>
        <p className="hidden text-xs uppercase tracking-widest text-rhyze-cream/50 md:block">
          Scroll horizontally on mobile
        </p>
      </div>

      <div className="no-scrollbar -mx-6 overflow-x-auto px-6 lg:mx-0 lg:px-0">
        <div className="grid min-w-[1000px] grid-cols-7 gap-3 lg:min-w-0">
          {days.map((d) => (
            <div key={d} className="flex flex-col gap-3">
              <div className="rounded-full bg-rhyze-black px-3 py-1.5 text-center text-xs font-bold uppercase tracking-widest">
                {d}
              </div>
              <div className="flex flex-col gap-2">
                {slotsForDay(d).map((slot) => (
                  <Link
                    key={`${slot.day}-${slot.time}-${slot.classSlug}`}
                    href={`/classes/${slot.classSlug}`}
                    className="focus-ring block rounded-xl border border-white/10 bg-rhyze-charcoal p-3 transition hover:border-rhyze-coral/40 hover:-translate-y-0.5"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-rhyze-cream/50">
                      {slot.time}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold leading-tight">
                      {slot.className}
                    </p>
                    <p className="text-[11px] text-rhyze-cream/55">
                      w/ {slot.instructor}
                    </p>
                    <span
                      className={cn(
                        'mt-2 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest',
                        statusStyles[slot.status],
                      )}
                    >
                      {statusLabel[slot.status]}
                    </span>
                  </Link>
                ))}
                {slotsForDay(d).length === 0 && (
                  <p className="rounded-xl border border-dashed border-white/10 p-3 text-center text-[10px] uppercase tracking-widest text-rhyze-cream/30">
                    Closed
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
