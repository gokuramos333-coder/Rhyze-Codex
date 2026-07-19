import Link from 'next/link';
import { ArrowRight, Clock, Users } from 'lucide-react';
import { ownedSchedule } from '@/lib/rhyze-platform';

export function ScheduleFull() {
  return (
    <section id="schedule" className="scroll-mt-28">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="font-display text-4xl tracking-wider md:text-6xl">
            SCHEDULE
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-rhyze-cream/65">
            Browse Rhyze-managed classes, check capacity, see waitlists, and
            book your spot directly through the Rhyze #2 New experience.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-rhyze-cream/75 hover:border-rhyze-coral hover:text-rhyze-coral"
        >
          Studio OS
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <div className="grid gap-4">
        {ownedSchedule.map((slot) => {
          const full = slot.booked >= slot.capacity;
          const fill = Math.round((slot.booked / slot.capacity) * 100);
          return (
            <article
              key={slot.id}
              className="grid gap-5 rounded-2xl border border-white/10 bg-rhyze-charcoal p-5 md:grid-cols-[0.6fr_1.5fr_1fr_auto]"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-rhyze-gold">
                  {slot.day}
                </p>
                <p className="mt-1 font-display text-3xl tracking-wider">
                  {slot.date}
                </p>
              </div>
              <div>
                <h3 className="font-display text-3xl tracking-wider">
                  {slot.className}
                </h3>
                <p className="mt-2 text-sm text-rhyze-cream/60">
                  {slot.instructor} · {slot.room} · {slot.price}
                </p>
              </div>
              <div>
                <div className="flex flex-wrap gap-3 text-xs uppercase tracking-widest text-rhyze-cream/60">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {slot.time} · {slot.duration}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" aria-hidden />
                    {slot.booked}/{slot.capacity}
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-rhyze-gradient"
                    style={{ width: `${fill}%` }}
                  />
                </div>
                <p className="mt-2 text-xs uppercase tracking-widest text-rhyze-gold">
                  {full ? `${slot.waitlist} on waitlist` : 'Spots available'}
                </p>
              </div>
              <Link
                href={slot.bookingHref}
                className="focus-ring inline-flex items-center justify-center gap-1 self-center rounded-full bg-rhyze-gradient px-5 py-3 text-xs font-bold uppercase tracking-widest text-rhyze-black hover:shadow-glow"
              >
                {full ? 'Join Waitlist' : 'Book spot'}
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
