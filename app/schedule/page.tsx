import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export default async function PublicSchedulePage({
  searchParams,
}: {
  searchParams: { category?: string; instructor?: string };
}) {
  const [occurrences, categories, instructors] = await Promise.all([
    prisma.classOccurrence.findMany({
      where: {
        status: 'SCHEDULED',
        template: {
          isActive: true,
          archivedAt: null,
          ...(searchParams.category
            ? { category: { slug: searchParams.category } }
            : {}),
        },
        ...(searchParams.instructor
          ? { instructorId: searchParams.instructor }
          : {}),
      },
      include: {
        template: { include: { category: true } },
        instructor: true,
        room: { include: { location: true } },
      },
      orderBy: { startAt: 'asc' },
      take: 60,
    }),
    prisma.classCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { role: 'INSTRUCTOR' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
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
            Filter upcoming classes, see the room and price, then open the
            class to reserve your place.
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
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
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
          {instructors.map((instructor) => (
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
        {occurrences.map((occurrence) => (
          <article
            key={occurrence.id}
            className="grid gap-5 border-l-4 border-rhyze-coral bg-rhyze-charcoal p-5 md:grid-cols-[10rem_1fr_auto] md:items-center"
          >
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-rhyze-gold">
                {occurrence.startAt.toLocaleDateString('en-US', {
                  timeZone: occurrence.timezone,
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              <p className="mt-2 font-display text-3xl tracking-wider">
                {occurrence.startAt.toLocaleTimeString('en-US', {
                  timeZone: occurrence.timezone,
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-rhyze-orange">
                {occurrence.template.category.name}
              </p>
              <h2 className="mt-1 font-display text-4xl tracking-wider">
                {occurrence.template.name}
              </h2>
              <p className="mt-2 text-sm text-rhyze-cream/60">
                {occurrence.instructor?.name || 'Instructor to be announced'} ·{' '}
                {occurrence.room?.name || 'Room to be announced'} ·{' '}
                {occurrence.template.durationMinutes} min
              </p>
            </div>
            <div className="md:text-right">
              <p className="font-display text-3xl text-rhyze-gold">
                ${((occurrence.priceCents || 0) / 100).toFixed(0)}
              </p>
              <p className="text-xs text-rhyze-cream/45">
                {occurrence.capacity} total spots
              </p>
              <Link
                href={`/schedule/${occurrence.id}`}
                className="focus-ring mt-3 inline-block bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase tracking-widest text-rhyze-black"
              >
                View class
              </Link>
            </div>
          </article>
        ))}
        {occurrences.length === 0 && (
          <div className="border border-dashed border-white/20 p-10 text-center">
            <h2 className="font-display text-4xl tracking-wider">
              NO MATCHING CLASSES
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
