import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar';
import { loadPublicScheduleSlots } from '@/lib/domain/schedule/public-schedule-query';

export async function SchedulePreview() {
  const slots = await loadPublicScheduleSlots();
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
              My Rhyze keeps class times, capacity, waitlists, credits, and
              booking inside the Rhyze website.
            </p>
          </div>
          <Link
            href="/classes#schedule"
            className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-rhyze-cream/75 hover:border-rhyze-coral hover:text-rhyze-coral"
          >
            View Classes & Schedule
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <WeeklyCalendar slots={slots} compact />
      </div>
    </section>
  );
}
