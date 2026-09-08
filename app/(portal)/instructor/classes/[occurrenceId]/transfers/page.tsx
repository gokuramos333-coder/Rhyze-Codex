import { notFound } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { memberBookingDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';
import { transferBookingAction } from './actions';

export default async function TransferPage(
  props: { params: Promise<{ occurrenceId: string }>; searchParams: Promise<{ booking?: string; error?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const instructor = await requireArea('instructor');
  const booking = await prisma.booking.findFirst({
    where: { id: searchParams.booking, occurrenceId: params.occurrenceId, occurrence: { instructorId: instructor.id } },
    include: { user: true, occurrence: { include: { template: true } } },
  });
  if (!booking) notFound();
  const destinations = await prisma.classOccurrence.findMany({
    where: { id: { not: booking.occurrenceId }, status: 'SCHEDULED', startAt: { gte: new Date(), lte: new Date(booking.occurrence.startAt.getTime() + 14 * 24 * 60 * 60_000) } },
    include: { template: true, instructor: true, _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } },
    orderBy: { startAt: 'asc' },
  });
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Member-requested transfer</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{booking.user.name || booking.user.email}</h1>
      <p className="mt-3 text-rhyze-black/55">Move from {booking.occurrence.template.name} on {memberBookingDateTimeLabel(booking.occurrence)}.</p>
      {searchParams.error && <p className="mt-5 border-l-4 border-rhyze-coral bg-white p-4 font-bold text-rhyze-coral">{searchParams.error === 'payment' ? 'The applicable transfer fee could not be charged. The original booking was not moved.' : 'That destination is no longer eligible or available.'}</p>}
      <form action={transferBookingAction} className="mt-8 grid gap-4 border-t-4 border-rhyze-gold bg-white p-6">
        <input type="hidden" name="bookingId" value={booking.id}/><input type="hidden" name="occurrenceId" value={booking.occurrenceId}/>
        <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">Destination class</span><select name="destinationId" required className="min-h-14 border px-3"><option value="">Choose an eligible class</option>{destinations.filter((item) => item._count.bookings + item.historicalSignupCount < item.capacity).map((item) => <option key={item.id} value={item.id}>{memberBookingDateTimeLabel(item)} · {item.template.name} · {item.instructor?.name || 'TBA'}</option>)}</select></label>
        <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">Member request / internal note</span><textarea name="reason" required rows={4} className="border p-3"/></label>
        <p className="text-xs text-rhyze-black/55">More than 6 hours: free. Between 2 and 6 hours: $5 for standard clients and no fee for VIP, intro-trial, or complimentary bookings. At 2 hours or less, transfer is blocked and the applicable $10 late-cancellation policy applies.</p>
        <button className="min-h-14 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest">Confirm transfer</button>
      </form>
    </>
  );
}
