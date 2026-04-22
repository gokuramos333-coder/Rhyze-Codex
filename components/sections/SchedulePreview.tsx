import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  days,
  slotsForDay,
  statusLabel,
  statusStyles,
  type Day,
} from '@/lib/schedule';

export function SchedulePreview({ from = 'Mon' as Day }: { from?: Day }) {
  const startIdx = days.indexOf(from);
  const previewDays: Day[] = [0, 1, 2].map((o) => days[(startIdx + o) % 7]);

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
          {previewDays.map((d) => {
            const slots = slotsForDay(d).slice(0, 4);
            return (
              <div
                key={d}
                className="rounded-2xl border border-white/10 bg-rhyze-black/50 p-6"
              >
                <div className="mb-5 inline-flex items-center rounded-full bg-rhyze-black px-4 py-1.5 text-sm font-bold uppercase tracking-widest">
                  {d}
                </div>
                <ul className="space-y-3">
                  {slots.map((slot) => (
                    <li
                      key={`${slot.day}-${slot.time}-${slot.classSlug}`}
                      className="flex items-start justify-between gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-rhyze-cream">
                          {slot.className}
                        </p>
                        <p className="text-xs text-rhyze-cream/50">
                          {slot.time} · {slot.instructor}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                          statusStyles[slot.status],
                        )}
                      >
                        {statusLabel[slot.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
