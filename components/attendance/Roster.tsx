import { markAttendanceAction, restoreCreditAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/roster/actions';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import { importedBookingParty } from '@/lib/domain/bookings/imported-booking-party';
import Link from 'next/link';

type RosterBooking = {
  id: string;
  status: string;
  bookedAt: Date;
  user: { id: string; name: string | null; email: string };
  attendance: { status: string } | null;
  policySnapshot?: unknown;
  paymentMethod: string;
  currentPlan: string;
};

function bookingBookedAtLabel(bookedAt: Date) {
  return bookedAt.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function Roster({
  occurrenceId,
  bookings,
  canRestore = false,
  canTransfer = false,
}: {
  occurrenceId: string;
  bookings: RosterBooking[];
  canRestore?: boolean;
  canTransfer?: boolean;
}) {
  return (
    <div className="mt-8 grid gap-3">
      {bookings.map((booking) => {
        const party = importedBookingParty(booking.policySnapshot);
        return (
        <article key={booking.id} className="grid gap-4 border-l-4 border-rhyze-orange bg-white p-5 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <h2 className="font-sans text-lg font-black">
              <Link href={`/admin/members/${booking.user.id}`} className="underline decoration-rhyze-gold decoration-2 underline-offset-4 hover:text-rhyze-coral">
                {booking.user.name || booking.user.email}
              </Link>
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-sm text-rhyze-black/50">{booking.user.email}</p>
              <AdminStatusBadge status={booking.attendance?.status || booking.status} />
            </div>
            <p className="mt-2 text-xs font-bold uppercase tracking-wider text-rhyze-black/45">
              Booked {bookingBookedAtLabel(booking.bookedAt)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider">
              <span className="bg-orange-50 px-2 py-1 text-rhyze-coral">Paid with: {booking.paymentMethod}</span>
              <span className="bg-rhyze-orange/10 px-2 py-1">Plan: {booking.currentPlan}</span>
              {party.seatCount > 1 && (
                <span className="bg-rhyze-gold/20 px-2 py-1 text-rhyze-black">
                  Party booking: {party.seatCount} spots total
                </span>
              )}
            </div>
            {party.guestNames.length > 0 && (
              <div className="mt-3 border-l-2 border-rhyze-gold bg-orange-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-rhyze-coral">
                  Additional attendees
                </p>
                <ul className="mt-2 grid gap-1 text-sm font-bold">
                  {party.guestNames.map((guestName) => (
                    <li key={guestName}>• {guestName}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(['CHECKED_IN', 'NO_SHOW', 'LATE_CANCELLED'] as const).map((status) => {
              const selected = booking.attendance?.status === status;
              const label = status === 'CHECKED_IN'
                ? 'Check in'
                : status === 'NO_SHOW'
                  ? 'No show'
                  : 'Late canceled';
              return (
              <form key={status} action={markAttendanceAction}>
                <input type="hidden" name="occurrenceId" value={occurrenceId} />
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="status" value={status} />
                <button className={`border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${selected ? (status === 'CHECKED_IN' ? 'border-emerald-700 bg-emerald-100 text-emerald-900' : 'border-red-700 bg-red-100 text-red-900') : 'border-rhyze-black/20 hover:border-rhyze-coral hover:text-rhyze-coral'}`}>
                  {selected ? `Undo ${label.toLowerCase()}` : label}
                </button>
              </form>
              );
            })}
            {canRestore && (
              <form action={restoreCreditAction}>
                <input type="hidden" name="occurrenceId" value={occurrenceId} />
                <input type="hidden" name="bookingId" value={booking.id} />
                <button className="bg-rhyze-black px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white">Restore credit</button>
              </form>
            )}
            {canTransfer && booking.status === 'CONFIRMED' && <Link href={`/instructor/classes/${occurrenceId}/transfers?booking=${booking.id}`} className="border border-rhyze-coral px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rhyze-coral">Transfer credit</Link>}
          </div>
        </article>
        );
      })}
      {bookings.length === 0 && <p className="bg-white p-8 text-rhyze-black/55">No members are booked yet.</p>}
    </div>
  );
}
