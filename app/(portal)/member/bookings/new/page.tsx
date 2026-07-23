import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { bookOccurrenceAction } from '../actions';

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: { occurrence?: string };
}) {
  const occurrence = searchParams.occurrence
    ? await prisma.classOccurrence.findUnique({
        where: { id: searchParams.occurrence },
        include: { template: true, instructor: true, room: true },
      })
    : null;
  if (!occurrence) notFound();

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Confirm booking</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{occurrence.template.name}</h1>
      <div className="mt-8 border-t-4 border-rhyze-gold bg-white p-6">
        <p className="font-bold">{occurrence.startAt.toLocaleString()} · {occurrence.instructor?.name || 'TBA'}</p>
        <p className="mt-2 text-sm text-rhyze-black/55">{occurrence.room?.name || 'Room TBA'} · {occurrence.capacity} spots</p>
        <form action={bookOccurrenceAction}>
          <input type="hidden" name="occurrenceId" value={occurrence.id} />
          <button className="mt-6 bg-rhyze-gradient px-6 py-4 text-xs font-black uppercase tracking-widest">Confirm my place</button>
        </form>
      </div>
    </>
  );
}
