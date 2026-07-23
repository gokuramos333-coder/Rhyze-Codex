import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';

export default async function AdminHomePage() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const [todayClasses, todayBookings, waitlists, members, trials, failed, revenue, signups, purchases] = await Promise.all([
    prisma.classOccurrence.findMany({ where: { startAt: { gte: start, lt: end } }, include: { template: true, instructor: true, _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } }, orderBy: { startAt: 'asc' } }),
    prisma.booking.count({ where: { bookedAt: { gte: start, lt: end } } }),
    prisma.waitlistEntry.count({ where: { status: 'WAITING' } }),
    prisma.user.count({ where: { role: 'MEMBER', status: 'ACTIVE' } }),
    prisma.membership.count({ where: { status: 'TRIALING' } }),
    prisma.purchase.count({ where: { status: 'FAILED' } }),
    prisma.purchase.aggregate({ where: { status: 'PAID', paidAt: { gte: monthStart } }, _sum: { amountCents: true } }),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.purchase.findMany({ include: { user: true, product: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);
  const metrics = [
    ['Today’s classes', todayClasses.length, '/admin/schedule'],
    ['Today’s bookings', todayBookings, '/admin/schedule'],
    ['Waitlist spots', waitlists, '/admin/schedule'],
    ['Active members', members, '/admin/members'],
    ['Trial members', trials, '/admin/members'],
    ['New signups', signups, '/admin/members'],
    ['Revenue this month', `$${((revenue._sum.amountCents || 0)/100).toFixed(0)}`, '/admin/reports'],
    ['Failed payments', failed, '/admin/payments'],
  ] as const;
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Live studio pulse</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider md:text-8xl">STUDIO CONTROL</h1>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label,value,href]) => <Link key={label} href={href} className="border-t-4 border-rhyze-orange bg-white p-5"><p className="text-xs font-black uppercase tracking-widest text-rhyze-black/55">{label}</p><p className="mt-3 font-display text-5xl">{value}</p></Link>)}
      </div>
      <div className="mt-10 grid gap-6 xl:grid-cols-2">
        <section><h2 className="font-display text-4xl tracking-wider">TODAY’S FLOOR</h2><div className="mt-4 grid gap-3">{todayClasses.map((item) => <Link key={item.id} href={`/admin/schedule/${item.id}/roster`} className="flex justify-between gap-4 bg-white p-5"><span><strong className="block">{item.template.name}</strong><small>{item.startAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {item.instructor?.name || 'TBA'}</small></span><strong>{item._count.bookings}/{item.capacity}</strong></Link>)}{todayClasses.length === 0 && <p className="bg-white p-6 text-rhyze-black/55">No classes scheduled today.</p>}</div></section>
        <section><h2 className="font-display text-4xl tracking-wider">RECENT PURCHASES</h2><div className="mt-4 grid gap-3">{purchases.map((item) => <Link key={item.id} href="/admin/payments" className="flex justify-between gap-4 bg-white p-5"><span><strong className="block">{item.product.name}</strong><small>{item.user.name || item.user.email} · {item.status}</small></span><strong>${(item.amountCents/100).toFixed(2)}</strong></Link>)}{purchases.length === 0 && <p className="bg-white p-6 text-rhyze-black/55">No purchases yet.</p>}</div></section>
      </div>
    </>
  );
}
