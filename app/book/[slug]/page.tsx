import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { categoryLabel, classes, getClass } from '@/lib/classes';
import { instructors } from '@/lib/instructors';
import { ownedMemberships, ownedSchedule } from '@/lib/rhyze-platform';
import { Button } from '@/components/ui/Button';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export const metadata: Metadata = {
  title: 'Book on Rhyze',
  robots: { index: false },
};

export function generateStaticParams() {
  return classes.map((c) => ({ slug: c.slug }));
}

function stripInstructorFromTitle(title: string) {
  return title
    .replace(/\s+w\/\s+.+$/i, '')
    .replace(/\s+with\s+[^"]+$/i, '')
    .trim();
}

export default async function BookingPage({
  params,
}: {
  params: { slug: string };
}) {
  const cls = getClass(params.slug);
  if (!cls) notFound();
  const [session, occurrence] = await Promise.all([
    auth(),
    prisma.classOccurrence.findFirst({
      where: {
        template: { slug: params.slug },
        status: 'SCHEDULED',
        startAt: { gt: new Date() },
      },
      orderBy: { startAt: 'asc' },
      select: { id: true },
    }),
  ]);
  const returnPath = `/book/${params.slug}`;
  const bookingHref = !session?.user
    ? `/sign-in?callbackUrl=${encodeURIComponent(returnPath)}`
    : occurrence
      ? `/member/bookings/new?occurrence=${occurrence.id}`
      : `/book/next-step?type=class&slug=${encodeURIComponent(params.slug)}`;

  const matchingSlot =
    ownedSchedule.find((slot) => slot.classSlug === params.slug) ?? null;
  const instructor = instructors.find((person) => {
    const className = cls.name.toLowerCase();
    const firstName = person.firstName.toLowerCase();
    const lastName = person.lastName.toLowerCase();

    return (
      className.includes(firstName) ||
      (lastName && className.includes(lastName))
    );
  });
  const instructorName =
    matchingSlot?.instructor ??
    [instructor?.firstName, instructor?.lastName].filter(Boolean).join(' ');
  const instructorPhoto = matchingSlot?.photo ?? instructor?.photo;
  const bookingTitle = stripInstructorFromTitle(cls.name);

  return (
    <main className="mx-auto max-w-6xl px-6 py-20">
      <Link
        href="/classes"
        className="focus-ring mb-10 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-rhyze-cream/60 hover:text-rhyze-coral"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to Classes
      </Link>

      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
            Class Booking
          </p>
          <h1 className="font-display text-6xl leading-none tracking-wider md:text-8xl">
            {bookingTitle.toUpperCase()}
          </h1>
          <p className="mt-4 text-xl italic text-rhyze-gold">{cls.tagline}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-rhyze-charcoal px-4 py-2 text-xs font-bold uppercase tracking-widest text-rhyze-cream/70">
              {categoryLabel[cls.category]}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-rhyze-charcoal px-4 py-2 text-xs font-bold uppercase tracking-widest text-rhyze-cream/70">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {cls.duration} min
            </span>
          </div>

          <div className="mt-10 space-y-6">
            {instructorPhoto && (
              <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
                <div className="grid gap-5 sm:grid-cols-[260px_1fr] sm:items-center">
                  <div className="relative h-72 overflow-hidden rounded-2xl border border-rhyze-gold/35 bg-rhyze-black">
                    <Image
                      src={instructorPhoto}
                      alt={`${instructorName} instructor photo`}
                      fill
                      sizes="(min-width: 640px) 260px, calc(100vw - 72px)"
                      className="object-cover object-top"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-rhyze-gold">
                      Instructor
                    </p>
                    <h2 className="mt-2 font-display text-5xl tracking-wider">
                      {instructorName}
                    </h2>
                    {instructor?.role && (
                      <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-rhyze-cream/60">
                        {instructor.role}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
              <h2 className="font-display text-4xl tracking-wider">
                Class Details
              </h2>
              <p className="mt-3 text-base leading-relaxed text-rhyze-cream/75">
                {cls.description}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
                <h2 className="mb-4 font-display text-3xl tracking-wider">
                  What To Expect
                </h2>
                <ul className="space-y-3 text-sm leading-relaxed text-rhyze-cream/75">
                  {cls.whatToExpect.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rhyze-gold" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
                <h2 className="mb-4 font-display text-3xl tracking-wider">
                  What To Bring
                </h2>
                <ul className="space-y-3 text-sm leading-relaxed text-rhyze-cream/75">
                  {cls.whatToBring.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rhyze-coral" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-3xl border border-rhyze-gold/30 bg-rhyze-gold/10 p-6">
              <div className="mb-5 inline-flex rounded-2xl border border-rhyze-gold/40 bg-rhyze-black/30 p-4">
                <Calendar className="h-8 w-8 text-rhyze-gold" aria-hidden />
              </div>
              <h2 className="font-display text-4xl tracking-wider">Schedule</h2>
              {matchingSlot ? (
                <div className="mt-4 grid gap-3 text-sm text-rhyze-cream/75 sm:grid-cols-2">
                  <p className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-rhyze-gold" aria-hidden />
                    {matchingSlot.day}, {matchingSlot.date} at{' '}
                    {matchingSlot.time}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-rhyze-gold" aria-hidden />
                    {matchingSlot.room}
                  </p>
                  <p className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-rhyze-gold" aria-hidden />
                    {matchingSlot.price}
                  </p>
                  <p className="text-rhyze-gold">
                    {matchingSlot.booked}/{matchingSlot.capacity} booked
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-rhyze-cream/75">
                  This class is part of the Rhyze catalog. Upcoming dates will
                  appear here once they are added to the live schedule.
                </p>
              )}
            </div>
          </div>
        </div>

        <aside className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6 lg:mt-64">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-gold">
            Choose How To Book
          </p>
          <div className="space-y-4">
            {ownedMemberships.slice(0, 3).map((plan) => (
              <div
                key={plan.id}
                className="rounded-2xl border border-white/10 bg-rhyze-black/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-2xl tracking-wider">
                      {plan.name}
                    </h3>
                    <p className="text-sm text-rhyze-cream/60">
                      {plan.credits}
                    </p>
                  </div>
                  <span className="font-display text-3xl text-rhyze-gold">
                    {plan.price}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-rhyze-gold/30 bg-rhyze-gold/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck
                className="mt-1 h-5 w-5 text-rhyze-gold"
                aria-hidden
              />
              <div>
                <h3 className="font-semibold uppercase tracking-wide">
                  Waiver status
                </h3>
                <p className="mt-1 text-sm text-rhyze-cream/70">
                  Signed general studio waiver. Membership terms will be
                  required before recurring billing goes live.
                </p>
              </div>
            </div>
          </div>

          <Button href={bookingHref} size="lg" className="mt-6 w-full">
            Confirm Booking <CheckCircle2 className="h-5 w-5" aria-hidden />
          </Button>
        </aside>
      </section>
    </main>
  );
}
