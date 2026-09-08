import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { Roster } from '@/components/attendance/Roster';

export default async function AdminRosterPage({ params }: { params: { occurrenceId: string } }) {
  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: params.occurrenceId },
    include: {
      template: true,
      instructor: true,
      bookings: {
        where: { status: { not: 'CANCELLED' } },
        include: { user: true, attendance: true },
        orderBy: { user: { name: 'asc' } },
      },
    },
  });
  if (!occurrence) notFound();
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Attendance desk</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{occurrence.template.name}</h1>
      <p className="mt-3 text-rhyze-black/55">{occurrence.startAt.toLocaleString()} · {occurrence.instructor?.name || 'TBA'} · {occurrence.bookings.length}/{occurrence.capacity}</p>
      <Roster occurrenceId={occurrence.id} bookings={occurrence.bookings} canRestore />
    </>
  );
}
