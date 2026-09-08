import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { WAITLIST_CAPACITY } from '@/lib/domain/bookings/booking-rules';
import { occurrenceInstructorName, occurrenceLocalTimeZone, occurrenceTitle, occurrenceTitleWithInstructor } from '@/lib/domain/schedule/occurrence-management';

export const dynamic = 'force-dynamic';

export default async function ClassOccurrencePage(
  props: {
    params: Promise<{ occurrenceId: string }>;
  }
) {
  const params = await props.params;
  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: params.occurrenceId },
    include: {
      template: { include: { category: true } },
      instructor: { include: { instructorProfile: true } },
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } }, waitlistEntries: { where: { status: 'WAITING' } } } },
    },
  });
  if (!occurrence) notFound();
  const bookedCount = occurrence._count.bookings + occurrence.historicalSignupCount;
  const soldOut = bookedCount >= occurrence.capacity;
  const waitlistFull = occurrence._count.waitlistEntries >= WAITLIST_CAPACITY;
  const instructorName = occurrenceInstructorName(occurrence);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-16">
      <Link href="/schedule" className="text-sm font-bold text-rhyze-orange">
        ← Back to schedule
      </Link>
      <article className="mt-8 border-t-4 border-rhyze-coral bg-rhyze-charcoal p-6 md:p-10">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-gold">
          {occurrence.template.category.name}
        </p>
        <h1 className="mt-3 font-display text-6xl tracking-wider md:text-8xl">
          {occurrenceTitleWithInstructor(occurrenceTitle(occurrence), instructorName)}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-rhyze-cream/70">
          {occurrence.template.description}
        </p>
        <dl className="mt-8 grid gap-4 border-y border-white/10 py-6 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-black uppercase tracking-widest text-rhyze-orange">Instructor</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 font-bold">
              <span>{instructorName}</span>
              {occurrence.isSubstitute && (
                <span className="rounded-sm bg-rhyze-coral px-1.5 py-0.5 text-[0.55rem] font-black uppercase tracking-widest text-white">
                  SUB
                </span>
              )}
            </dd>
          </div>
          <Detail
            label="Date and time"
            value={occurrence.startAt.toLocaleString('en-US', {
              timeZone: occurrenceLocalTimeZone(),
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          />
          <Detail label="Availability" value={soldOut ? `SOLD OUT · ${occurrence._count.waitlistEntries}/${WAITLIST_CAPACITY} waiting` : `${Math.max(0, occurrence.capacity - bookedCount)} spots remaining`} />
        </dl>
        {waitlistFull ? (
          <span className="mt-8 inline-block cursor-not-allowed border border-white/20 bg-white/10 px-7 py-4 text-sm font-black uppercase tracking-widest text-rhyze-cream/45">Waitlist full</span>
        ) : (
          <Link
            href={`/member/bookings/new?occurrence=${occurrence.id}`}
            className="focus-ring mt-8 inline-block bg-rhyze-gradient px-7 py-4 text-sm font-black uppercase tracking-widest text-rhyze-black"
          >
            {soldOut ? 'Join waiting list' : 'Sign in to book'}
          </Link>
        )}
      </article>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-widest text-rhyze-orange">
        {label}
      </dt>
      <dd className="mt-1 font-bold">{value}</dd>
    </div>
  );
}
