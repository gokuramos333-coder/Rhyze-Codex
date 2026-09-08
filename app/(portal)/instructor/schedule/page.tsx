import Link from 'next/link';
import { instructorRosterHref } from '@/lib/admin/assigned-roster-navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { LiveDataRefresh } from '@/components/live/LiveDataRefresh';
import { memberBookingDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function purchaseCreditValueCents(input: {
  amountCents: number;
  includedCredits: number | null;
}) {
  if (!input.includedCredits || input.includedCredits <= 1) return input.amountCents;
  return Math.round(input.amountCents / input.includedCredits);
}

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function InstructorSchedulePage() {
  const user = await requireArea('instructor');
  const classes = await prisma.classOccurrence.findMany({
    where: {
      instructorId: user.id,
      startAt: { gte: new Date() },
      status: { in: ['SCHEDULED', 'CANCELLED'] },
    },
    include: {
      template: true,
      room: true,
      bookings: {
        where: { status: 'CONFIRMED' },
        select: { id: true },
      },
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
    },
    orderBy: { startAt: 'asc' },
    take: 60,
  });
  const bookingIds = classes.flatMap((item) => item.bookings.map((booking) => booking.id));
  const reservedCredits = bookingIds.length
    ? await prisma.creditLedgerEntry.findMany({
        where: { bookingId: { in: bookingIds }, type: 'RESERVE' },
        select: {
          bookingId: true,
          creditAccount: {
            select: {
              sourcePurchase: {
                select: {
                  amountCents: true,
                  product: { select: { includedCredits: true } },
                },
              },
            },
          },
        },
      })
    : [];
  const revenueByBookingId = new Map(
    reservedCredits.flatMap((entry) => {
      if (!entry.bookingId || !entry.creditAccount.sourcePurchase) return [];
      return [
        [
          entry.bookingId,
          purchaseCreditValueCents({
            amountCents: entry.creditAccount.sourcePurchase.amountCents,
            includedCredits: entry.creditAccount.sourcePurchase.product.includedCredits,
          }),
        ] as const,
      ];
    }),
  );
  const isTriciaJohnsen =
    user.email.toLowerCase() === 'tricia@rhyzefit.com' ||
    user.name?.toLowerCase().includes('tricia johnsen');

  return (
    <>
      <LiveDataRefresh />
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Teaching calendar</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MY CLASSES</h1>
      <div className="mt-8 grid gap-3">
        {classes.map((item) => {
          const classRevenueCents = item.bookings.reduce(
            (total, booking) => total + (revenueByBookingId.get(booking.id) || 0),
            0,
          );
          return (
          <Link key={item.id} href={instructorRosterHref(item.id)} className={`grid gap-2 border-l-4 bg-white p-5 transition hover:bg-orange-50 md:grid-cols-[1fr_auto] ${item.status === 'CANCELLED' ? 'border-red-700 opacity-80' : 'border-rhyze-gold hover:border-rhyze-coral'}`}>
            <span>
              {item.status === 'CANCELLED' && (
                <span className="mb-2 inline-block bg-red-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-900">
                  CLASS CANCELED
                </span>
              )}
              <strong className="block font-display text-3xl tracking-wider">{item.template.name}</strong>
              <span className="text-sm text-rhyze-black/55">{memberBookingDateTimeLabel(item)} · {item.room?.name || 'Room TBA'}</span>
              {item.status === 'CANCELLED' && (
                <span className="mt-2 block text-sm font-bold text-red-900">
                  This class is canceled and no longer accepting bookings.
                </span>
              )}
              {isTriciaJohnsen && (
                <span className="mt-2 block text-xs font-black uppercase tracking-widest text-emerald-700">
                  Class revenue: {formatDollars(classRevenueCents)}
                </span>
              )}
            </span>
            <span className="text-left md:text-right">
              <span className="block text-xs font-black uppercase tracking-widest">{item._count.bookings + item.historicalSignupCount}/{item.capacity} booked</span>
              <span className="mt-2 block text-[10px] font-black uppercase tracking-widest text-rhyze-coral">View attendees →</span>
            </span>
          </Link>
        );})}
        {classes.length === 0 && <p className="bg-white p-8 text-rhyze-black/55">No upcoming assigned classes.</p>}
      </div>
    </>
  );
}
