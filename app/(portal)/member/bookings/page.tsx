import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { cancelBookingAction, leaveWaitlistAction } from './actions';
import { memberBookingDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';
import { CancelBookingButton } from '@/components/member/CancelBookingButton';
import { bookingAccessType } from '@/lib/domain/bookings/booking-access';
import { cancellationPolicyDecision } from '@/lib/domain/bookings/cancellation-policy';

const messages: Record<string, string> = {
  confirmed: 'Your class is confirmed.',
  rescheduled: 'Your class was rescheduled and that credit is now applied to the new class.',
  'reschedule-blocked': 'This class is inside the two-hour window. The credit cannot be transferred.',
  'reschedule-payment': 'The transfer fee could not be charged. Your original class was not moved. Please update your saved payment method and try again.',
  'reschedule-destination': 'Choose an eligible class within two weeks that still has room.',
  'reschedule-select-booking': 'Choose a confirmed future class below, then select Reschedule.',
  waitlist: 'The class is full. You joined the waitlist.',
  'waitlist-full': 'The class and its five-person waitlist are both full.',
  waiver: 'Complete the studio waiver before booking this class.',
  access: 'A membership, class pack, or drop-in is required.',
  duplicate: 'You already booked this class.',
  overlap: 'This class overlaps another booking.',
  unavailable: 'This class is no longer available.',
  'trial-event': 'The 7-day intro trial covers standard classes only. Events and workshops require separate access.',
  'trial-not-open': 'The $7 intro offer is available now and activates on your first booked standard class.',
  'trial-window': 'This class falls outside your 7-day intro trial window.',
  'cancelled-credit': 'Booking cancelled. Your class credit was returned.',
  'cancelled': 'Booking cancelled. No fee was charged.',
  'late-cancel-credit': 'Late cancellation recorded. The class credit was not returned.',
  'late-cancel-charged': 'Late cancellation recorded and the disclosed attendance fee was charged to your saved card.',
  'late-cancel-payment': 'Late cancellation recorded, but the attendance fee could not be charged. Please update your saved payment method or contact the studio.',
};

function memberBookingActions(
  booking: { id: string; occurrence: { startAt: Date } },
  decision: ReturnType<typeof cancellationPolicyDecision>,
) {
  const minutesUntilClass = (booking.occurrence.startAt.getTime() - Date.now()) / 60_000;
  const insideTwoHourWindow = minutesUntilClass <= 120;
  return (
    <div className="flex flex-wrap gap-2">
      {!insideTwoHourWindow && (
        <Link
          href={`/member/bookings/reschedule?booking=${booking.id}`}
          className="bg-rhyze-black px-4 py-2 text-xs font-black uppercase tracking-widest text-white"
        >
          Reschedule
        </Link>
      )}
      <CancelBookingButton
        bookingId={booking.id}
        decision={decision}
        action={cancelBookingAction}
      />
    </div>
  );
}

export default async function MemberBookingsPage(
  props: {
    searchParams: Promise<{ result?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await requireArea('member');
  const now = new Date();
  const [bookings, waitlist, activeMemberships] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: user.id },
      include: { occurrence: { include: { template: true, instructor: true, room: true } } },
      orderBy: { bookedAt: 'desc' },
    }),
    prisma.waitlistEntry.findMany({
      where: { userId: user.id, status: 'WAITING' },
      include: { occurrence: { include: { template: true } } },
    }),
    prisma.membership.findMany({
      where: { userId: user.id, status: { in: ['ACTIVE', 'TRIALING'] } },
      select: { product: { select: { kind: true } } },
    }),
  ]);
  const reservations = bookings.length > 0
    ? await prisma.creditLedgerEntry.findMany({
        where: { bookingId: { in: bookings.map((booking) => booking.id) }, type: 'RESERVE' },
        include: {
          creditAccount: {
            include: {
              sourcePurchase: { select: { product: { select: { kind: true } } } },
            },
          },
        },
      })
    : [];
  const reservationByBooking = new Map(
    reservations.map((reservation) => [reservation.bookingId, reservation]),
  );
  const activeProductKinds = activeMemberships.map(
    (membership) => membership.product.kind,
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Your classes</p>
          <h1 className="mt-3 font-display text-6xl tracking-wider">BOOKINGS</h1>
        </div>
        <Link href="/schedule" className="bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase tracking-widest">Book a class</Link>
      </div>
      {searchParams.result && (
        <p className="mt-6 border-l-4 border-rhyze-coral bg-white p-4 text-sm font-bold">
          {messages[searchParams.result] || 'Booking updated.'}
        </p>
      )}
      <div className="mt-8 grid gap-3">
        {bookings.map((booking) => {
          const reservation = reservationByBooking.get(booking.id);
          const accessType = bookingAccessType({
            policySnapshot: booking.policySnapshot,
            bookingSource: booking.source,
            reservedProductKind: reservation?.creditAccount.sourcePurchase?.product.kind ?? null,
            activeProductKinds,
          });
          const decision = cancellationPolicyDecision({
            startAt: booking.occurrence.startAt,
            requestedAt: now,
            accessType,
            isEvent: booking.occurrence.template.isEvent,
            hasReservedCredit: Boolean(reservation),
          });
          return (
          <article
            key={booking.id}
            className={`grid gap-3 border-l-4 p-5 md:grid-cols-[1fr_auto] ${
              booking.status === 'CONFIRMED' || booking.status === 'ATTENDED'
                ? 'border-emerald-700 bg-emerald-50'
                : booking.status === 'CANCELLED' || booking.status === 'LATE_CANCELLED' || booking.status === 'NO_SHOW'
                  ? 'border-red-700 bg-red-50'
                  : 'border-rhyze-coral bg-white'
            }`}
          >
            <div>
              <h2 className="font-display text-3xl tracking-wider">{booking.occurrence.template.name}</h2>
              <p className="text-sm text-rhyze-black/55">
                {memberBookingDateTimeLabel(booking.occurrence)} · {booking.occurrence.instructor?.name || 'TBA'}
              </p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-rhyze-black/45">
                {booking.occurrence.template.isEvent ? 'Event' : 'Class'} · {booking.occurrence.room?.name || 'Room TBA'} · {booking.occurrence.template.durationMinutes} min
              </p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-rhyze-black/45">
                Booked at {memberBookingDateTimeLabel({ startAt: booking.bookedAt, timezone: booking.occurrence.timezone })}
              </p>
              <span className="mt-2 inline-block text-xs font-black uppercase tracking-widest">{booking.status}</span>
            </div>
            {booking.status === 'CONFIRMED' && booking.occurrence.startAt > now && memberBookingActions(booking, decision)}
          </article>
        )})}
        {bookings.length === 0 && <p className="bg-white p-8 text-rhyze-black/55">No bookings yet. Choose a class from the live schedule.</p>}
      </div>
      {waitlist.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-4xl tracking-wider">WAITLIST</h2>
          {waitlist.map((entry) => (
            <div key={entry.id} className="mt-3 flex items-center justify-between gap-4 bg-white p-4">
              <p className="font-bold">{entry.occurrence.template.name}</p>
              <form action={leaveWaitlistAction}>
                <input type="hidden" name="waitlistId" value={entry.id} />
                <button className="border border-rhyze-black px-3 py-2 text-xs font-black uppercase tracking-widest">
                  Leave waitlist
                </button>
              </form>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
