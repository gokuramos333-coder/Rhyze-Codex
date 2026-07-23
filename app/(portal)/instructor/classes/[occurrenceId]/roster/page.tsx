import { notFound } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Roster } from '@/components/attendance/Roster';

export default async function InstructorRosterPage({ params }: { params: { occurrenceId: string } }) {
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
        include: { user: true, attendance: true },
        orderBy: { user: { name: 'asc' } },
      },
    },
  });
  if (!occurrence) notFound();

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Class roster</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{occurrence.template.name}</h1>
      <p className="mt-3 text-rhyze-black/55">{occurrence.startAt.toLocaleString()} · {occurrence.room?.name || 'Room TBA'} · {occurrence.bookings.length}/{occurrence.capacity}</p>
      <Roster occurrenceId={occurrence.id} bookings={occurrence.bookings} canTransfer />
    </>
  );
}
