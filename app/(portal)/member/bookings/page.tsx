import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { cancelBookingAction } from './actions';

const messages: Record<string, string> = {
  confirmed: 'Your class is confirmed.',
  waitlist: 'The class is full. You joined the waitlist.',
  waiver: 'Sign the current studio waiver before booking.',
  access: 'A membership, class pack, or drop-in is required.',
  duplicate: 'You already booked this class.',
  overlap: 'This class overlaps another booking.',
  unavailable: 'This class is no longer available.',
};

export default async function MemberBookingsPage({
  searchParams,
}: {
  searchParams: { result?: string };
}) {
  const user = await requireArea('member');
  const [bookings, waitlist] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: user.id },
      include: { occurrence: { include: { template: true, instructor: true } } },
      orderBy: { bookedAt: 'desc' },
    }),
    prisma.waitlistEntry.findMany({
      where: { userId: user.id, status: 'WAITING' },
      include: { occurrence: { include: { template: true } } },
    }),
  ]);

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
          {searchParams.result === 'waiver' && <Link href="/member/waiver" className="ml-2 text-rhyze-coral">Open waiver →</Link>}
        </p>
      )}
      <div className="mt-8 grid gap-3">
        {bookings.map((booking) => (
          <article key={booking.id} className="grid gap-3 border-l-4 border-rhyze-coral bg-white p-5 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="font-display text-3xl tracking-wider">{booking.occurrence.template.name}</h2>
              <p className="text-sm text-rhyze-black/55">{booking.occurrence.startAt.toLocaleString()} · {booking.occurrence.instructor?.name || 'TBA'}</p>
              <span className="mt-2 inline-block text-xs font-black uppercase tracking-widest">{booking.status}</span>
            </div>
            {booking.status === 'CONFIRMED' && (
              <form action={cancelBookingAction}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <button className="border border-rhyze-coral px-4 py-2 text-xs font-black uppercase tracking-widest text-rhyze-coral">Cancel</button>
              </form>
            )}
          </article>
        ))}
        {bookings.length === 0 && <p className="bg-white p-8 text-rhyze-black/55">No bookings yet. Choose a class from the live schedule.</p>}
      </div>
      {waitlist.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-4xl tracking-wider">WAITLIST</h2>
          {waitlist.map((entry) => <p key={entry.id} className="mt-3 bg-white p-4 font-bold">{entry.occurrence.template.name}</p>)}
        </section>
      )}
    </>
  );
}
