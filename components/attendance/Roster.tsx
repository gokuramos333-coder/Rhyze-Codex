import { markAttendanceAction, restoreCreditAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/roster/actions';
import Link from 'next/link';

type RosterBooking = {
  id: string;
  status: string;
  user: { name: string | null; email: string };
  attendance: { status: string } | null;
};

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
      {bookings.map((booking) => (
        <article key={booking.id} className="grid gap-4 border-l-4 border-rhyze-orange bg-white p-5 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <h2 className="text-lg font-black">{booking.user.name || booking.user.email}</h2>
            <p className="text-sm text-rhyze-black/50">{booking.user.email} · {booking.attendance?.status || booking.status}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['CHECKED_IN', 'ATTENDED', 'NO_SHOW', 'LATE_CANCELLED'] as const).map((status) => (
              <form key={status} action={markAttendanceAction}>
                <input type="hidden" name="occurrenceId" value={occurrenceId} />
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="status" value={status} />
                <button className="border border-rhyze-black/20 px-3 py-2 text-[10px] font-black uppercase tracking-wider hover:border-rhyze-coral hover:text-rhyze-coral">
                  {status.replace('_', ' ')}
                </button>
              </form>
            ))}
            {canRestore && (
              <form action={restoreCreditAction}>
                <input type="hidden" name="occurrenceId" value={occurrenceId} />
                <input type="hidden" name="bookingId" value={booking.id} />
                <button className="bg-rhyze-black px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white">Restore credit</button>
              </form>
            )}
            {canTransfer && booking.status === 'CONFIRMED' && <Link href={`/instructor/classes/${occurrenceId}/transfers?booking=${booking.id}`} className="border border-rhyze-coral px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rhyze-coral">Transfer</Link>}
          </div>
        </article>
      ))}
      {bookings.length === 0 && <p className="bg-white p-8 text-rhyze-black/55">No members are booked yet.</p>}
    </div>
  );
}
