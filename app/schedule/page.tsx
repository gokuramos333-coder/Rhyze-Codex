import Link from 'next/link';
import {
  loadPublicScheduleFilterOptions,
  loadPublicScheduleSlots,
} from '@/lib/domain/schedule/public-schedule-query';
import { localDateKey } from '@/lib/domain/schedule/public-calendar';

export const dynamic = 'force-dynamic';

export default async function PublicSchedulePage({
  searchParams,
}: {
  searchParams: { category?: string; instructor?: string };
}) {
  const todayKey = localDateKey();
  const [slots, filters] = await Promise.all([
    loadPublicScheduleSlots(undefined, {
      categorySlug: searchParams.category,
      instructorId: searchParams.instructor,
    }),
    loadPublicScheduleFilterOptions(),
  ]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl overflow-x-hidden px-6 py-16">
      <p className="text-xs font-black uppercase tracking-[0.32em] text-rhyze-orange">
        Live studio calendar
      </p>
      <div className="mt-3 flex min-w-0 flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="max-w-full font-display text-5xl tracking-wide md:text-8xl md:tracking-wider">
            FIND YOUR RHYTHM
          </h1>
          <p className="mt-4 max-w-full text-rhyze-cream/65 md:max-w-2xl">
            Showing classes from today forward. Booking numbers are live
            confirmed bookings only.
          </p>
        </div>
        <Link
          href="/sign-in"
          className="focus-ring w-fit border border-rhyze-gold px-5 py-3 text-xs font-black uppercase tracking-widest text-rhyze-gold"
        >
          My bookings
        </Link>
      </div>

      <form className="mt-10 grid w-full min-w-0 max-w-full gap-3 border border-white/10 bg-rhyze-charcoal p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <select
          name="category"
          defaultValue={searchParams.category || ''}
          className="min-h-12 w-full min-w-0 bg-rhyze-black px-4 text-sm text-rhyze-cream"
        >
          <option value="">All class types</option>
          {filters.categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          name="instructor"
          defaultValue={searchParams.instructor || ''}
          className="min-h-12 w-full min-w-0 bg-rhyze-black px-4 text-sm text-rhyze-cream"
        >
          <option value="">All instructors</option>
          {filters.instructors.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructor.name}
            </option>
          ))}
        </select>
        <button className="min-h-12 w-full bg-rhyze-gradient px-6 text-xs font-black uppercase tracking-widest text-rhyze-black md:w-auto">
          Apply filters
        </button>
      </form>

      <div className="mt-8 grid gap-4">
        {slots.map((slot) => (
          <article
            key={slot.id}
            className="grid min-w-0 gap-5 border-l-4 border-rhyze-coral bg-rhyze-charcoal p-5 md:grid-cols-[10rem_minmax(0,1fr)_auto] md:items-center"
          >
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-rhyze-gold">
                {slot.shortDay}, {slot.dateLabel}
              </p>
              <p className="mt-2 font-display text-3xl tracking-wider">
                {slot.timeLabel}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-rhyze-orange">
                {slot.category}
              </p>
              <h2 className="mt-1 max-w-full break-words font-display text-3xl tracking-wide md:text-4xl md:tracking-wider">
                {slot.className}
              </h2>
              <p className="mt-2 text-sm text-rhyze-cream/60">
                {slot.instructor} · {slot.room} · {slot.duration}
              </p>
            </div>
            <div className="md:text-right">
              <p className="font-display text-3xl text-rhyze-gold">
                {slot.price}
              </p>
              <p className="text-xs text-rhyze-cream/45">
                {slot.booked}/{slot.capacity} booked
                {slot.waitlist ? ` · ${slot.waitlist} waiting` : ''}
              </p>
              <Link
                href={slot.bookingHref}
                className="focus-ring mt-3 inline-block bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase tracking-widest text-rhyze-black"
              >
                View class
              </Link>
            </div>
          </article>
        ))}
        {slots.length === 0 && (
          <div className="border border-dashed border-white/20 p-10 text-center">
            <h2 className="font-display text-4xl tracking-wider">
              NO MATCHING CLASSES FROM TODAY
            </h2>
            <Link
              href="/schedule"
              className="mt-4 inline-block font-bold text-rhyze-orange"
            >
              Clear filters
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
