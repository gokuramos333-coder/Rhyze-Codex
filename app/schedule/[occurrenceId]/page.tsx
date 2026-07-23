import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export default async function ClassOccurrencePage({
  params,
}: {
  params: { occurrenceId: string };
}) {
  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: params.occurrenceId },
    include: {
      template: { include: { category: true } },
      instructor: { include: { instructorProfile: true } },
      room: { include: { location: true } },
    },
  });
  if (!occurrence) notFound();

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
          {occurrence.template.name}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-rhyze-cream/70">
          {occurrence.template.description}
        </p>
        <dl className="mt-8 grid gap-4 border-y border-white/10 py-6 sm:grid-cols-2">
          <Detail label="Instructor" value={occurrence.instructor?.name || 'TBA'} />
          <Detail
            label="Date and time"
            value={occurrence.startAt.toLocaleString('en-US', {
              timeZone: occurrence.timezone,
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          />
          <Detail
            label="Location"
            value={`${occurrence.room?.name || 'TBA'} · ${occurrence.room?.location.name || 'Rhyze Fitness'}`}
          />
          <Detail label="Capacity" value={`${occurrence.capacity} spots`} />
        </dl>
        <Link
          href={`/member/bookings/new?occurrence=${occurrence.id}`}
          className="focus-ring mt-8 inline-block bg-rhyze-gradient px-7 py-4 text-sm font-black uppercase tracking-widest text-rhyze-black"
        >
          Sign in to book
        </Link>
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
