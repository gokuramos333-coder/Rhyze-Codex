import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export default async function InstructorSchedulePage() {
  const user = await requireArea('instructor');
  const classes = await prisma.classOccurrence.findMany({
    where: { instructorId: user.id, startAt: { gte: new Date() } },
    include: {
      template: true,
      room: true,
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
    },
    orderBy: { startAt: 'asc' },
    take: 60,
  });

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Teaching calendar</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MY CLASSES</h1>
      <div className="mt-8 grid gap-3">
        {classes.map((item) => (
          <Link key={item.id} href={`/instructor/classes/${item.id}/roster`} className="grid gap-2 border-l-4 border-rhyze-gold bg-white p-5 md:grid-cols-[1fr_auto]">
            <span>
              <strong className="block font-display text-3xl tracking-wider">{item.template.name}</strong>
              <span className="text-sm text-rhyze-black/55">{item.startAt.toLocaleString()} · {item.room?.name || 'Room TBA'}</span>
            </span>
            <span className="text-xs font-black uppercase tracking-widest">{item._count.bookings}/{item.capacity} booked</span>
          </Link>
        ))}
        {classes.length === 0 && <p className="bg-white p-8 text-rhyze-black/55">No upcoming assigned classes.</p>}
      </div>
    </>
  );
}
