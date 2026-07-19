import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ownedSchedule } from '@/lib/rhyze-platform';

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
              Rhyze #2 New keeps class times, capacity, waitlists, credits, and
              booking inside the Rhyze website.
            </p>
          </div>
          <Link
            href="/classes#schedule"
            className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-rhyze-cream/75 hover:border-rhyze-coral hover:text-rhyze-coral"
          >
            View Full Schedule
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {ownedSchedule.map((slot) => {
            const fill = Math.round((slot.booked / slot.capacity) * 100);
            return (
              <article
                key={slot.id}
                className="rounded-2xl border border-white/10 bg-rhyze-black/70 p-5"
              >
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-rhyze-gold">
                  {slot.day} · {slot.date}
                </p>
                <h3 className="mt-3 font-display text-3xl tracking-wider">
                  {slot.className}
                </h3>
                <p className="mt-2 text-sm text-rhyze-cream/60">
                  {slot.time} · {slot.instructor}
                </p>
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-xs uppercase tracking-widest text-rhyze-cream/50">
                    <span>{slot.booked}/{slot.capacity}</span>
                    <span>{slot.waitlist ? `${slot.waitlist} waitlist` : 'Open'}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-rhyze-gradient"
                      style={{ width: `${fill}%` }}
                    />
                  </div>
                </div>
                <Link
                  href={slot.bookingHref}
                  className="focus-ring mt-5 inline-flex items-center gap-1 rounded-full bg-rhyze-gradient px-4 py-2 text-xs font-bold uppercase tracking-widest text-rhyze-black hover:shadow-glow"
                >
                  Reserve on Rhyze <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
