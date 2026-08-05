import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { Roster } from '@/components/attendance/Roster';
import { rosterPaymentDetails } from '@/lib/domain/bookings/roster-payment';
import { importedBookingParty } from '@/lib/domain/bookings/imported-booking-party';
import { occurrenceAdminDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';
import { addMemberToClassAction, addOwnerComplimentaryBookingAction } from './actions';

const addMemberMessages: Record<string, { text: string; tone: 'success' | 'error' | 'info' }> = {
  'member-added': { text: 'Member added to this class and one available credit was reserved.', tone: 'success' },
  'member-search': { text: 'Enter at least 2 characters from the member name or email.', tone: 'error' },
  'member-not-found': { text: 'No matching client account was found.', tone: 'error' },
  'member-already-booked': { text: 'That member is already on this roster.', tone: 'info' },
  'member-overlap': { text: 'That member is already booked into another class at this time.', tone: 'error' },
  'member-no-credit': { text: 'That member does not have an available credit for this class.', tone: 'error' },
  'attendance-checked_in': { text: 'Attendance saved: checked in.', tone: 'success' },
  'attendance-no_show': { text: 'Attendance saved: no-show.', tone: 'success' },
  'attendance-late_cancelled': { text: 'Attendance saved: late canceled.', tone: 'success' },
  'attendance-cleared': { text: 'Attendance mark cleared; booking returned to confirmed.', tone: 'info' },
  unavailable: { text: 'This class is not available for admin booking.', tone: 'error' },
  full: { text: 'This class is full.', tone: 'error' },
};

function messageClass(tone: 'success' | 'error' | 'info') {
  if (tone === 'success') return 'border-emerald-600 bg-emerald-50 text-emerald-900';
  if (tone === 'error') return 'border-red-700 bg-red-100 text-red-900';
  return 'border-rhyze-gold bg-orange-50 text-rhyze-black';
}

export default async function AdminRosterPage(props: {
  params: Promise<{ occurrenceId: string }>;
  searchParams?: Promise<{ result?: string }>;
}) {
  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};
  const resultMessage = searchParams.result ? addMemberMessages[searchParams.result] : null;
  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: params.occurrenceId },
    include: {
      template: true,
      instructor: true,
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
  const [ledgerEntries, owners] = await Promise.all([
    prisma.creditLedgerEntry.findMany({
    where: { bookingId: { in: occurrence.bookings.map((booking) => booking.id) }, type: 'RESERVE' },
    include: { creditAccount: true },
    }),
    prisma.user.findMany({
      where: { email: { in: ['vanessa@rhyzefit.com', 'melissa@rhyzefit.com'] }, role: 'OWNER' },
      select: { id: true, email: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
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
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Attendance desk</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{occurrence.template.name}</h1>
      <p className="mt-3 text-rhyze-black/55">{occurrenceAdminDateTimeLabel(occurrence)} · {occurrence.instructor?.name || 'TBA'} · {occurrence.bookings.length + occurrence.historicalSignupCount}/{occurrence.capacity}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {owners.map((owner) => {
          const attending = occurrence.bookings.some((booking) => booking.userId === owner.id && booking.status === 'CONFIRMED');
          return attending ? (
            <span key={owner.id} className="bg-emerald-100 px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-900">{owner.name} attending</span>
          ) : (
            <form key={owner.id} action={addOwnerComplimentaryBookingAction}>
              <input type="hidden" name="occurrenceId" value={occurrence.id} />
              <input type="hidden" name="email" value={owner.email} />
              <button className="bg-rhyze-gradient px-4 py-3 text-xs font-black uppercase tracking-wider">Add {owner.name} — no charge</button>
            </form>
          );
        })}
      </div>
      {unnamedHistoricalSignups > 0 && <p className="mt-2 bg-rhyze-orange/10 p-3 text-sm font-bold">{unnamedHistoricalSignups} additional signup{unnamedHistoricalSignups === 1 ? '' : 's'} came from a Somble schedule snapshot without roster names.</p>}
      {resultMessage && (
        <p className={`mt-4 border-l-4 p-4 font-bold ${messageClass(resultMessage.tone)}`}>
          {resultMessage.text}
        </p>
      )}
      <section className="mt-6 border-t-4 border-rhyze-orange bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-rhyze-coral">Attendees</p>
        <h2 className="mt-2 font-display text-4xl tracking-wider">Add member to this class</h2>
        <p className="mt-2 text-sm font-bold text-rhyze-black/55">
          Search by client name or email. Admin-added bookings reserve one eligible member credit, including same-month single standard class credits.
        </p>
        <form action={addMemberToClassAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input type="hidden" name="occurrenceId" value={occurrence.id} />
          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-widest">Client name or email</span>
            <input
              name="memberQuery"
              className="min-h-12 border border-rhyze-black/20 px-3"
              placeholder="Example: Lilly Nugnes"
            />
          </label>
          <button className="self-end bg-rhyze-black px-5 py-3 text-xs font-black uppercase tracking-widest text-white">
            Add member
          </button>
        </form>
      </section>
      <Roster occurrenceId={occurrence.id} bookings={rosterBookings} canRestore />
    </>
  );
}
