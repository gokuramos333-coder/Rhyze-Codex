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
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-16">
      <p className="text-xs font-black uppercase tracking-[0.32em] text-rhyze-orange">
        Live studio calendar
      </p>
      <div className="mt-3 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-6xl tracking-wider md:text-8xl">
            FIND YOUR RHYTHM
          </h1>
          <p className="mt-4 max-w-2xl text-rhyze-cream/65">
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

      <form className="mt-10 grid gap-3 border border-white/10 bg-rhyze-charcoal p-4 md:grid-cols-[1fr_1fr_auto]">
        <select
          name="category"
          defaultValue={searchParams.category || ''}
          className="min-h-12 bg-rhyze-black px-4 text-sm text-rhyze-cream"
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
          className="min-h-12 bg-rhyze-black px-4 text-sm text-rhyze-cream"
        >
          <option value="">All instructors</option>
          {filters.instructors.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructor.name}
            </option>
          ))}
        </select>
        <button className="min-h-12 bg-rhyze-gradient px-6 text-xs font-black uppercase tracking-widest text-rhyze-black">
          Apply filters
        </button>
      </form>

      <div className="mt-8 grid gap-4">
        {slots.map((slot) => (
          <article
            key={slot.id}
            className="grid gap-5 border-l-4 border-rhyze-coral bg-rhyze-charcoal p-5 md:grid-cols-[10rem_1fr_auto] md:items-center"
          >
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-rhyze-gold">
                {slot.shortDay}, {slot.dateLabel}
              </p>
              <p className="mt-2 font-display text-3xl tracking-wider">
                {slot.timeLabel}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-rhyze-orange">
                {slot.category}
              </p>
              <h2 className="mt-1 font-display text-4xl tracking-wider">
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
