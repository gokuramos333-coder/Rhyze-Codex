import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export default async function MemberHomePage() {
  const user = await requireArea('member');
  const [upcoming, pastCount, credits, activeWaiver] = await Promise.all([
    prisma.booking.findMany({ where: { userId: user.id, status: 'CONFIRMED', occurrence: { startAt: { gte: new Date() } } }, include: { occurrence: { include: { template: true, instructor: true } } }, orderBy: { occurrence: { startAt: 'asc' } }, take: 3 }),
    prisma.attendanceRecord.count({ where: { userId: user.id, status: 'ATTENDED' } }),
    prisma.creditAccount.findMany({ where: { userId: user.id }, include: { entries: true } }),
    prisma.waiverVersion.findFirst({ where: { isActive: true, requiresSign: true }, include: { acceptances: { where: { userId: user.id } } } }),
  ]);
  const balance = credits.reduce((sum, account) => sum + account.entries.reduce((value, entry) => value + entry.quantity, 0), 0);
  const waiverReady = !activeWaiver || activeWaiver.acceptances.length > 0;
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Member home</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider md:text-8xl">WELCOME, {(user.name || 'Rhyzer').split(' ')[0].toUpperCase()}</h1>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Link href="/member/bookings" className="border-t-4 border-rhyze-orange bg-white p-5"><p className="text-xs font-black uppercase tracking-widest">Upcoming</p><p className="mt-3 font-display text-5xl">{upcoming.length}</p></Link>
        <Link href="/member/membership" className="border-t-4 border-rhyze-gold bg-white p-5"><p className="text-xs font-black uppercase tracking-widest">Available Credits</p><p className="mt-3 font-display text-5xl">{balance}</p></Link>
        <Link href="/member/bookings" className="border-t-4 border-rhyze-coral bg-white p-5"><p className="text-xs font-black uppercase tracking-widest">Classes attended</p><p className="mt-3 font-display text-5xl">{pastCount}</p></Link>
      </div>
      {!waiverReady && <Link href="/member/waiver" className="mt-6 block border-l-4 border-rhyze-coral bg-white p-4 font-bold text-rhyze-coral">Your waiver needs a signature before booking →</Link>}
      <div className="mt-10 flex items-end justify-between gap-4"><h2 className="font-display text-4xl tracking-wider">UP NEXT</h2><Link href="/schedule" className="text-xs font-black uppercase tracking-widest text-rhyze-coral">Browse schedule →</Link></div>
      <div className="mt-4 grid gap-3">{upcoming.map((booking) => <Link key={booking.id} href="/member/bookings" className="bg-white p-5"><strong className="block font-display text-3xl tracking-wider">{booking.occurrence.template.name}</strong><small>{booking.occurrence.startAt.toLocaleString()} · {booking.occurrence.instructor?.name || 'TBA'}</small></Link>)}{upcoming.length === 0 && <p className="bg-white p-8 text-rhyze-black/55">Nothing booked yet. Your next class is waiting.</p>}</div>
    </>
  );
}
