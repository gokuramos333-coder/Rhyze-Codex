import { notFound } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { memberBookingDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';
import { Roster } from '@/components/attendance/Roster';
import Link from 'next/link';
import { rosterPaymentDetails } from '@/lib/domain/bookings/roster-payment';
import { importedBookingParty } from '@/lib/domain/bookings/imported-booking-party';
import { evaluateTransferWindow } from '@/lib/domain/transfers/transfer-policy';
import { LiveDataRefresh } from '@/components/live/LiveDataRefresh';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InstructorRosterPage(props: { params: Promise<{ occurrenceId: string }> }) {
  const params = await props.params;
  const user = await requireArea('instructor');
  const occurrence = await prisma.classOccurrence.findFirst({
    where: {
      id: params.occurrenceId,
      ...(user.role === 'INSTRUCTOR' ? { instructorId: user.id } : {}),
    },
    include: {
      template: true,
      room: true,
      bookings: {
        where: { status: { not: 'CANCELLED' } },
        include: {
          user: {
            include: {
              memberships: {
                where: { status: { in: ['ACTIVE', 'TRIALING', 'PAUSED', 'PAST_DUE'] } },
                include: { product: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
          attendance: true,
        },
        orderBy: { bookedAt: 'desc' },
      },
    },
  });
  if (!occurrence) notFound();
  const ledgerEntries = await prisma.creditLedgerEntry.findMany({
    where: { bookingId: { in: occurrence.bookings.map((booking) => booking.id) }, type: 'RESERVE' },
    include: { creditAccount: true },
  });
  const ledgerByBooking = new Map(ledgerEntries.map((entry) => [entry.bookingId, entry]));
  const rosterBookings = occurrence.bookings.map((booking) => {
    const membership = booking.user.memberships[0];
    const imported = importedBookingParty(booking.policySnapshot);
    const payment = rosterPaymentDetails({
      bookingSource: booking.source,
      currentPlanName: membership?.product.name || null,
      currentPlanKind: membership?.product.kind || null,
      reservedCreditLabel: ledgerByBooking.get(booking.id)?.creditAccount.label || null,
      importedAccessType: imported.accessType,
    });
    return { ...booking, bookedAt: booking.bookedAt, ...payment };
  });
  const namedImportedGuests = occurrence.bookings.reduce(
    (total, booking) =>
      total + importedBookingParty(booking.policySnapshot).guestNames.length,
    0,
  );
  const unnamedHistoricalSignups = Math.max(
    0,
    occurrence.historicalSignupCount - namedImportedGuests,
  );
  const transfersAvailable = evaluateTransferWindow(occurrence.startAt, new Date(), 'STANDARD') !== 'BLOCKED';

  return (
    <>
      <LiveDataRefresh />
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Class roster</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{occurrence.template.name}</h1>
      <p className="mt-3 text-rhyze-black/55">{memberBookingDateTimeLabel(occurrence)} · {occurrence.room?.name || 'Room TBA'} · {occurrence.bookings.length + occurrence.historicalSignupCount}/{occurrence.capacity}</p>
      {occurrence.status === 'CANCELLED' && (
        <p className="mt-5 border-l-4 border-red-700 bg-red-100 p-4 text-sm font-black uppercase tracking-widest text-red-900">
          CLASS CANCELED · This class is canceled and no longer accepting bookings.
        </p>
      )}
      {unnamedHistoricalSignups > 0 && <p className="mt-2 bg-rhyze-orange/10 p-3 text-sm font-bold">{unnamedHistoricalSignups} additional signup{unnamedHistoricalSignups === 1 ? '' : 's'} came from a Somble schedule snapshot without roster names.</p>}
      <Link href={`/instructor/classes/${occurrence.id}/message`} className="mt-5 inline-block bg-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest text-white">Message or cancel this class</Link>
      {!transfersAvailable && <p className="mt-4 border-l-4 border-red-700 bg-red-100 p-3 text-sm font-bold text-red-900">Transfers close 2 hours before class. Late cancellations and no-shows keep the used credit.</p>}
      <Roster occurrenceId={occurrence.id} bookings={rosterBookings} canTransfer={transfersAvailable} />
    </>
  );
}
