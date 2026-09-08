import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Tag,
} from 'lucide-react';
import { categoryLabel, classes, getClass } from '@/lib/classes';
import {
  complimentaryStandardAccessCanBook,
  instructorAugustStandardClassAccess,
  standardSingleClassCreditCanBook,
} from '@/lib/domain/bookings/booking-rules';
import { instructors } from '@/lib/instructors';
import { ownedSchedule } from '@/lib/rhyze-platform';
import { publicBookingCountLabel } from '@/lib/catalog/public-booking-count';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { occurrenceInstructorName, occurrenceLocalTimeZone, occurrenceTitle } from '@/lib/domain/schedule/occurrence-management';

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

export default async function BookingPage(
  props: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ occurrence?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const cls = getClass(params.slug);
  if (!cls) notFound();
  const session = await auth();
  const now = new Date();
  const [occurrence, bookingProducts, activeMembership, creditAccounts] = await Promise.all([
    prisma.classOccurrence.findFirst({
      where: {
        template: { slug: params.slug },
        status: 'SCHEDULED',
        ...(searchParams.occurrence
          ? { id: searchParams.occurrence }
          : { startAt: { gt: now } }),
      },
      orderBy: { startAt: 'asc' },
      include: {
        template: { select: { isEvent: true, durationMinutes: true, name: true } },
        instructor: { include: { instructorProfile: true } },
        series: { select: { recurrenceRule: true } },
        _count: {
          select: {
            bookings: { where: { status: 'CONFIRMED' } },
            waitlistEntries: { where: { status: 'WAITING' } },
          },
        },
      },
    }),
    prisma.product.findMany({
      where: {
        isActive: true,
        isPublic: true,
        kind: {
           in: [
             'INTRO_TRIAL',
             'DROP_IN',
           ],
        },
      },
      select: {
        id: true,
        kind: true,
        name: true,
        description: true,
        priceCents: true,
        billingInterval: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { priceCents: 'asc' }],
    }),
    session?.user?.id
      ? prisma.membership.findFirst({
          where: {
            userId: session.user.id,
            status: { in: ['TRIALING', 'ACTIVE'] },
          },
          include: { product: true },
        })
      : Promise.resolve(null),
    session?.user?.id
      ? prisma.creditAccount.findMany({
          where: {
            userId: session.user.id,
            validFrom: { lte: now },
            OR: [{ validUntil: null }, { validUntil: { gt: now } }],
          },
          include: {
            entries: true,
            sourcePurchase: {
              include: { product: { select: { kind: true, customPlanType: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const eligibleCreditAccounts = occurrence
    ? creditAccounts.filter((account) => {
        const productKind = account.sourcePurchase?.product.kind ?? null;
        const productAllowsOccurrence = complimentaryStandardAccessCanBook({
          customPlanType: account.sourcePurchase?.product.customPlanType,
          isEvent: occurrence.template.isEvent,
          durationMinutes: occurrence.template.durationMinutes,
        });
        return productAllowsOccurrence && (productKind !== 'DROP_IN' || standardSingleClassCreditCanBook({
          productKind,
          paidAt: account.sourcePurchase?.paidAt,
          occurrenceStartsAt: occurrence.startAt,
          isEvent: occurrence.template.isEvent,
          validUntil: account.validUntil,
        }));
      })
    : creditAccounts;
  const occurrenceAllowsPlan = (customPlanType: string | null | undefined) => occurrence
    ? complimentaryStandardAccessCanBook({
        customPlanType,
        isEvent: occurrence.template.isEvent,
        durationMinutes: occurrence.template.durationMinutes,
      })
    : true;
  const availableCredits = eligibleCreditAccounts.reduce(
    (total, account) =>
      total +
      (account.isUnlimited
        ? 0
        : account.entries.reduce((balance, entry) => balance + entry.quantity, 0)),
    0,
  );
  const hasUnlimitedAccess =
    eligibleCreditAccounts.some((account) => account.isUnlimited) ||
    (activeMembership?.product.isUnlimited && occurrenceAllowsPlan(activeMembership.product.customPlanType)) ||
    activeMembership?.product.kind === 'INTRO_TRIAL';
  const hasInstructorAugustStandardAccess = occurrence
    ? instructorAugustStandardClassAccess({
        role: session?.user?.role,
        occurrenceStartsAt: occurrence.startAt,
        isEvent: occurrence.template.isEvent,
      })
    : false;
  const hasMembershipAccess = Boolean(
    hasInstructorAugustStandardAccess ||
    hasUnlimitedAccess ||
    availableCredits > 0,
  );
  const creditDisplay = hasInstructorAugustStandardAccess
    ? 'Instructor August access: standard classes are free'
    : hasUnlimitedAccess
    ? 'Unlimited standard classes available'
    : `${availableCredits} credit${availableCredits === 1 ? '' : 's'} remaining`;
  const returnPath = occurrence
    ? `/book/${params.slug}?occurrence=${occurrence.id}`
    : `/book/${params.slug}`;
  const memberBookingDestination = occurrence
    ? `/member/bookings/new?occurrence=${occurrence.id}`
    : `/book/next-step?type=class&slug=${encodeURIComponent(params.slug)}`;
  const bookingHref = !session?.user
    ? `/sign-in?callbackUrl=${encodeURIComponent(memberBookingDestination)}`
    : hasMembershipAccess
      ? memberBookingDestination
      : `/memberships?returnTo=${encodeURIComponent(returnPath)}`;
  const purchaseHref = (productId?: string) => {
    if (!productId) return '/memberships';
    const destination = `/member/membership?selected=${encodeURIComponent(productId)}&returnTo=${encodeURIComponent(returnPath)}`;
    return session?.user
      ? destination
      : `/sign-in?callbackUrl=${encodeURIComponent(destination)}`;
  };

  const matchingSlot =
    ownedSchedule.find((slot) => slot.classSlug === params.slug) ?? null;
  const isWeekly = Boolean(occurrence?.series || matchingSlot);
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
    occurrence ? occurrenceInstructorName(occurrence) :
    matchingSlot?.instructor ??
    [instructor?.firstName, instructor?.lastName].filter(Boolean).join(' ');
  const instructorPhoto =
    occurrence?.instructor?.instructorProfile?.photoUrl ??
    matchingSlot?.photo ??
    instructor?.photo;
  const bookingTitle = occurrence ? occurrenceTitle(occurrence) : stripInstructorFromTitle(cls.name);
  const occurrenceBookingCount = occurrence
    ? occurrence._count.bookings + occurrence.historicalSignupCount
    : 0;
  const soldOut = Boolean(occurrence && occurrenceBookingCount >= occurrence.capacity);
  const effectiveBookingHref = soldOut && occurrence
    ? session?.user
      ? memberBookingDestination
      : `/sign-in?callbackUrl=${encodeURIComponent(memberBookingDestination)}`
    : bookingHref;
  const introProduct = bookingProducts.find(
    (product) => product.kind === 'INTRO_TRIAL',
  );
  const singleClassProduct = bookingProducts.find(
    (product) => product.kind === 'DROP_IN',
  );
  const introPrice = introProduct?.priceCents ?? 700;
  const singleClassPrice =
    occurrence?.priceCents ?? singleClassProduct?.priceCents ?? 2500;

  return (
    <main className="mx-auto max-w-6xl px-6 pb-20 pt-8 md:pt-10">
      <Link
        href="/classes"
        className="focus-ring mb-6 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-rhyze-cream/60 hover:text-rhyze-coral"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to Classes
      </Link>

      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
            <div className={instructorPhoto ? 'grid gap-6 sm:grid-cols-[260px_1fr] sm:items-center' : ''}>
              {instructorPhoto && (
                  <div className="relative h-72 overflow-hidden rounded-2xl border border-rhyze-gold/35 bg-rhyze-black">
                    <Image
                      src={instructorPhoto}
                      alt={`${instructorName} instructor photo`}
                      fill
                      sizes="(min-width: 640px) 260px, calc(100vw - 72px)"
                      className="object-cover object-top"
                    />
                  </div>
              )}
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
                  Class Booking
                </p>
                <h1 className="mt-3 font-display text-5xl leading-none tracking-wider md:text-6xl">
                  {bookingTitle.toUpperCase()}
                </h1>
                <div className="mt-5">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.3em] text-rhyze-gold">
                    Instructor
                  </p>
                  <h2 className="mt-1 flex flex-wrap items-center gap-2 font-display text-4xl tracking-wider">
                    <span>{instructorName || 'Rhyze Instructor'}</span>
                    {occurrence?.isSubstitute && (
                      <span className="rounded-sm bg-rhyze-coral px-1.5 py-0.5 text-[0.55rem] font-black uppercase tracking-widest text-white">
                        SUB
                      </span>
                    )}
                  </h2>
                  {instructor?.role && (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-rhyze-cream/60">
                      {instructor.role}
                    </p>
                  )}
                </div>
                <p className="mt-3 text-lg italic text-rhyze-gold">
                  {cls.tagline}
                </p>
                <p className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-rhyze-cream/65">
                  {categoryLabel[cls.category]}
                  <span aria-hidden>·</span>
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {cls.duration} min
                </p>
              </div>
            </div>
          </div>

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
              {occurrence ? (
                <div className="mt-4 grid gap-3 text-sm text-rhyze-cream/75 sm:grid-cols-2">
                  <p className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-rhyze-gold" aria-hidden />
                    {occurrence.startAt.toLocaleString('en-US', {
                      timeZone: occurrenceLocalTimeZone(),
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-rhyze-gold" aria-hidden />
                    ${((occurrence.priceCents || 2500) / 100).toFixed(0)}
                  </p>
                  {isWeekly && (
                    <p className="flex items-center gap-2 font-semibold text-rhyze-gold">
                      <Calendar className="h-4 w-4" aria-hidden />
                      Weekly recurring class
                    </p>
                  )}
                  {publicBookingCountLabel(
                    occurrenceBookingCount,
                    occurrence.capacity,
                  ) && (
                    <p className="text-rhyze-gold">
                      {publicBookingCountLabel(
                        occurrenceBookingCount,
                        occurrence.capacity,
                      )}
                    </p>
                  )}
                </div>
              ) : matchingSlot ? (
                <div className="mt-4 grid gap-3 text-sm text-rhyze-cream/75 sm:grid-cols-2">
                  <p className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-rhyze-gold" aria-hidden />
                    {matchingSlot.day}, {matchingSlot.date} at{' '}
                    {matchingSlot.time}
                  </p>
                  <p className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-rhyze-gold" aria-hidden />
                    {matchingSlot.price}
                  </p>
                  <p className="flex items-center gap-2 font-semibold text-rhyze-gold">
                    <Calendar className="h-4 w-4" aria-hidden />
                    Weekly recurring class
                  </p>
                  {publicBookingCountLabel(
                    matchingSlot.booked,
                    matchingSlot.capacity,
                  ) && (
                    <p className="text-rhyze-gold">
                      {publicBookingCountLabel(
                        matchingSlot.booked,
                        matchingSlot.capacity,
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-rhyze-cream/75">
                  This class is part of the Rhyze catalog. Upcoming dates will
                  appear here once they are added to the live schedule.
                </p>
              )}
          </div>
        </div>

        <aside className="h-fit rounded-3xl border border-white/10 bg-rhyze-charcoal p-6 lg:sticky lg:top-28">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-gold">
            Choose How To Book
          </p>
          <div className="space-y-4">
            <Link
              href={effectiveBookingHref}
              className="focus-ring block rounded-2xl border border-rhyze-coral/50 bg-rhyze-coral/10 p-4 transition hover:border-rhyze-coral hover:bg-rhyze-coral/20"
            >
              <p className="text-[0.65rem] font-black uppercase tracking-[0.25em] text-rhyze-coral">
                {session?.user ? 'Your membership' : 'Already have a plan?'}
              </p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl tracking-wider">
                    {soldOut ? 'Join Waiting List' : 'Use Membership Credit'}
                  </h3>
                  <p className="mt-1 text-sm text-rhyze-cream/60">
                    {soldOut
                      ? 'This class is sold out. Join the five-person waiting list without being charged.'
                      : !session?.user
                      ? 'Sign in to check your membership and credits.'
                      : hasMembershipAccess
                        ? creditDisplay
                        : 'No available membership credits. Explore membership options below.'}
                  </p>
                </div>
                <span className="text-2xl text-rhyze-coral" aria-hidden>→</span>
              </div>
            </Link>

            {activeMembership && !hasMembershipAccess && (
              <div className="rounded-2xl border border-rhyze-orange/50 bg-rhyze-orange/10 p-4">
                <p className="text-[0.65rem] font-black uppercase tracking-[0.25em] text-rhyze-orange">
                  Credits used
                </p>
                <h3 className="mt-1 font-display text-2xl tracking-wider">
                  Upgrade To Keep Booking
                </h3>
                <p className="mt-1 text-sm text-rhyze-cream/60">
                  Your account has 0 credits remaining. Choose a plan below to continue.
                </p>
              </div>
            )}

            {!activeMembership && <Link
              href={purchaseHref(introProduct?.id)}
              className="focus-ring block rounded-2xl border border-rhyze-gold/45 bg-rhyze-gold/10 p-4 transition hover:border-rhyze-gold hover:bg-rhyze-gold/20"
            >
              <p className="text-[0.65rem] font-black uppercase tracking-[0.25em] text-rhyze-gold">
                First-time clients
              </p>
              <div className="mt-1 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl tracking-wider">
                    Intro Offer 7-Days
                  </h3>
                  <p className="mt-1 text-sm text-rhyze-cream/60">
                    Unlimited standard classes for seven days.
                  </p>
                </div>
                <span className="font-display text-3xl text-rhyze-gold">
                  ${(introPrice / 100).toFixed(0)}
                </span>
              </div>
            </Link>}

            {!activeMembership && <Link
              href={purchaseHref(singleClassProduct?.id)}
              className="focus-ring block rounded-2xl border border-white/15 bg-rhyze-black/50 p-4 transition hover:border-rhyze-orange hover:bg-rhyze-orange/10"
            >
              <p className="text-[0.65rem] font-black uppercase tracking-[0.25em] text-rhyze-orange">
                No membership needed
              </p>
              <div className="mt-1 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl tracking-wider">
                    Single Class
                  </h3>
                  <p className="mt-1 text-sm text-rhyze-cream/60">
                    Purchase one credit for this class, valid for 1 month.
                  </p>
                </div>
                <span className="font-display text-3xl text-rhyze-gold">
                  ${(singleClassPrice / 100).toFixed(0)}
                </span>
              </div>
            </Link>}

            <div className="space-y-3 border-t border-rhyze-gold/25 pt-5">
              <div>
                <p className="text-[0.65rem] font-black uppercase tracking-[0.25em] text-rhyze-gold">
                  Save With A Membership
                </p>
                <p className="mt-1 text-sm text-rhyze-cream/60">
                  Join for the month and keep moving with Rhyze.
                </p>
              </div>
              <Link
                href={`/memberships?returnTo=${encodeURIComponent(returnPath)}`}
                className="focus-ring block rounded-2xl border border-rhyze-gold/45 bg-rhyze-gold/10 px-5 py-4 text-center text-xs font-black uppercase tracking-[0.18em] text-rhyze-gold transition hover:border-rhyze-gold hover:bg-rhyze-gold/20"
              >
                Explore Membership Options
              </Link>
            </div>
          </div>

        </aside>
      </section>
    </main>
  );
}
