import Link from 'next/link';
import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar';
import {
  loadPublicScheduleFilterOptions,
  loadPublicScheduleSlots,
} from '@/lib/domain/schedule/public-schedule-query';

export const dynamic = 'force-dynamic';

export default async function PublicSchedulePage(
  props: {
    searchParams: Promise<{
      category?: string;
      instructor?: string;
      class?: string;
      date?: string;
      view?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const from = new Date();
  const [slots, filterOptions] = await Promise.all([
    loadPublicScheduleSlots(from, {
      classSlug: searchParams.class,
      categorySlug: searchParams.category,
      instructorId: searchParams.instructor,
    }),
    loadPublicScheduleFilterOptions(from),
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
            Filter upcoming classes, see the price, then open the class to
            reserve your place.
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
        {searchParams.class && (
          <input type="hidden" name="class" value={searchParams.class} />
        )}
        {searchParams.date && (
          <input type="hidden" name="date" value={searchParams.date} />
        )}
        {searchParams.view && (
          <input type="hidden" name="view" value={searchParams.view} />
        )}
        <label className="sr-only" htmlFor="schedule-category">
          Class type
        </label>
        <select
          id="schedule-category"
          name="category"
          defaultValue={searchParams.category || ''}
          className="min-h-12 bg-rhyze-black px-4 text-sm text-rhyze-cream"
        >
          <option value="">All class types</option>
          {filterOptions.categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="schedule-instructor">
          Instructor
        </label>
        <select
          id="schedule-instructor"
          name="instructor"
          defaultValue={searchParams.instructor || ''}
          className="min-h-12 bg-rhyze-black px-4 text-sm text-rhyze-cream"
        >
          <option value="">All instructors</option>
          {filterOptions.instructors.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructor.name}
            </option>
          ))}
        </select>
        <button className="min-h-12 bg-rhyze-gradient px-6 text-xs font-black uppercase tracking-widest text-rhyze-black">
          Apply filters
        </button>
      </form>

      {(searchParams.class ||
        searchParams.category ||
        searchParams.instructor) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-rhyze-gold/20 bg-rhyze-gold/10 px-4 py-3 text-sm">
          <p className="font-bold text-rhyze-gold">
            Showing {slots.length} matching upcoming class
            {slots.length === 1 ? '' : 'es'}.
          </p>
          <Link
            href="/schedule"
            className="focus-ring rounded text-xs font-black uppercase tracking-widest text-rhyze-orange"
          >
            Clear filters
          </Link>
        </div>
      )}

      <div className="mt-8">
        <WeeklyCalendar
          slots={slots}
          initialDateKey={searchParams.date}
          initialView={
            searchParams.view === 'weekly' || searchParams.view === 'monthly'
              ? searchParams.view
              : 'daily'
          }
        />
      </div>
    </main>
  );
}
