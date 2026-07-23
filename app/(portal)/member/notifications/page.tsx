import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { markNotificationReadAction } from './actions';

export default async function MemberNotificationsPage() {
  const user = await requireArea('member');
  const notifications = await prisma.inAppNotification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Studio updates</p><h1 className="mt-3 font-display text-6xl tracking-wider">NOTIFICATIONS</h1>
      <div className="mt-8 grid gap-3">{notifications.map((item) => <article key={item.id} className={`border-l-4 bg-white p-5 ${item.readAt ? 'border-black/10 opacity-70' : 'border-rhyze-coral'}`}><strong className="block text-lg">{item.title}</strong><p className="mt-2 text-sm text-rhyze-black/60">{item.body}</p><div className="mt-3 flex gap-3">{item.link && <Link href={item.link} className="text-xs font-black uppercase text-rhyze-coral">Open details</Link>}{!item.readAt && <form action={markNotificationReadAction}><input type="hidden" name="id" value={item.id}/><button className="text-xs font-black uppercase">Mark read</button></form>}</div></article>)}{notifications.length === 0 && <p className="bg-white p-8 text-rhyze-black/55">No updates yet.</p>}</div>
    </>
  );
}
