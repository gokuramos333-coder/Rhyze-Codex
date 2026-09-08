import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar';
import { loadPublicScheduleSlots } from '@/lib/domain/schedule/public-schedule-query';

export async function ScheduleFull() {
  const slots = await loadPublicScheduleSlots();
  return (
    <section id="schedule" className="scroll-mt-28">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="font-display text-4xl tracking-wider md:text-6xl">
            SCHEDULE
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-rhyze-cream/65">
            Browse Rhyze-managed classes, check capacity, see waitlists, and
            book your spot directly through the My Rhyze experience.
          </p>
        </div>
        <Link
          href="/member/bookings"
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-rhyze-cream/75 hover:border-rhyze-coral hover:text-rhyze-coral"
        >
          My Bookings
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <WeeklyCalendar slots={slots} />
    </section>
  );
}
