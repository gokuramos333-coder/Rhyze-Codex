import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { evaluateTransferWindow } from '@/lib/domain/transfers/transfer-policy';
import { memberBookingDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';
import { RescheduleClassPicker } from '@/components/member/RescheduleClassPicker';
import { rescheduleMemberBookingAction } from './actions';
import { bookingAccessType } from '@/lib/domain/bookings/booking-access';

export default async function MemberReschedulePage(
  props: { searchParams: Promise<{ booking?: string }> },
) {
  const searchParams = await props.searchParams;
  const user = await requireArea('member');
  const booking = await prisma.booking.findFirst({
    where: { id: searchParams.booking, userId: user.id, status: 'CONFIRMED' },
    include: { occurrence: { include: { template: true, instructor: true } } },
  });
  if (!booking) redirect('/member/bookings?result=reschedule-select-booking');

  const [reservation, activeMemberships] = await Promise.all([
    prisma.creditLedgerEntry.findFirst({
      where: { bookingId: booking.id, type: 'RESERVE' },
      include: {
        creditAccount: {
          include: {
            sourcePurchase: { select: { product: { select: { kind: true } } } },
          },
        },
      },
    }),
    prisma.membership.findMany({
      where: { userId: user.id, status: { in: ['ACTIVE', 'TRIALING'] } },
      select: { product: { select: { kind: true } } },
    }),
  ]);
  const accessType = bookingAccessType({
    policySnapshot: booking.policySnapshot,
    bookingSource: booking.source,
    reservedProductKind: reservation?.creditAccount.sourcePurchase?.product.kind ?? null,
    activeProductKinds: activeMemberships.map((membership) => membership.product.kind),
  });
  const policy = evaluateTransferWindow(booking.occurrence.startAt, new Date(), accessType);
  if (policy === 'BLOCKED') redirect('/member/bookings?result=reschedule-blocked');

  const destinations = await prisma.classOccurrence.findMany({
    where: {
      id: { not: booking.occurrenceId },
      status: 'SCHEDULED',
      startAt: {
        gte: new Date(),
        lte: new Date(booking.occurrence.startAt.getTime() + 14 * 24 * 60 * 60_000),
      },
    },
    include: {
      template: true,
      instructor: true,
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
    },
    orderBy: { startAt: 'asc' },
  });
  const openDestinations = destinations.filter(
    (item) => item._count.bookings + item.historicalSignupCount < item.capacity,
  );

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Reschedule class</p>
      <h1 className="mt-3 break-words font-display text-4xl leading-none tracking-wider sm:text-5xl lg:text-6xl">Choose the class using this credit</h1>
      <p className="mt-3 break-words text-rhyze-black/55">
        Moving from {booking.occurrence.template.name} · {memberBookingDateTimeLabel(booking.occurrence)}. You must choose a class within two weeks now for the credit to roll over.
      </p>
      {policy === 'FEE_500' && (
        <p className="mt-5 border-l-4 border-rhyze-gold bg-orange-50 p-4 font-bold">
          This reschedule is inside 6 hours, so your saved card will be charged a $5 transfer fee only after you choose and confirm the new class.
        </p>
      )}
      <form action={rescheduleMemberBookingAction} className="mt-8 grid w-full min-w-0 gap-4 border-t-4 border-rhyze-orange bg-white p-4 sm:p-6">
        <input type="hidden" name="bookingId" value={booking.id} />
        <RescheduleClassPicker destinations={openDestinations} />
        <button
          disabled={openDestinations.length === 0}
          className="min-h-14 w-full bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:bg-rhyze-black/15 disabled:text-rhyze-black/45"
        >
          {openDestinations.length > 0 ? 'Confirm reschedule' : 'No classes available'}
        </button>
      </form>
    </>
  );
}
