import Link from 'next/link';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export default async function AdminMessagesPage() {
  const actor = await requireApprovedOwner();
  const [conversations, unreadNotifications, classMessages, campaigns] = await Promise.all([
    prisma.memberConversation.findMany({
      include: {
        member: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.inAppNotification.findMany({
      where: {
        userId: actor.id,
        readAt: null,
        link: { startsWith: '/admin/messages/' },
      },
      select: { link: true },
    }),
    prisma.classMessage.findMany({
      include: { instructor: true, occurrence: { include: { template: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.emailCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  const unreadByConversation = unreadNotifications.reduce<Record<string, number>>((counts, notification) => {
    if (notification.link) counts[notification.link] = (counts[notification.link] || 0) + 1;
    return counts;
  }, {});

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Communications</p>
          <h1 className="mt-3 font-display text-6xl tracking-wider">MESSAGES</h1>
        </div>
        <Link href="/admin/campaigns" className="bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase">Create Announcement</Link>
      </div>
      <section className="mt-8 border-t-4 border-rhyze-coral bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">Shared owner inbox · Vanessa + Melissa</p>
            <h2 className="mt-2 font-display text-4xl tracking-wider">MEMBER CONVERSATIONS</h2>
          </div>
          <span className="text-sm font-bold text-rhyze-black/45">{conversations.length} threads</span>
        </div>
        <div className="mt-4 divide-y divide-black/10">
          {conversations.map((conversation) => {
            const latest = conversation.messages[0];
            const unread = unreadByConversation[`/admin/messages/${conversation.id}`] || 0;
            return (
              <Link key={conversation.id} href={`/admin/messages/${conversation.id}`} className="focus-ring flex items-center justify-between gap-5 py-4 hover:text-rhyze-coral">
                <span className="min-w-0">
                  <strong className="block truncate">{conversation.member.name || conversation.member.email}</strong>
                  <span className="mt-1 block truncate text-sm text-rhyze-black/50">{latest?.deletedAt ? 'Message unsent' : latest?.body || conversation.subject}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {latest && <time className="text-xs font-bold text-rhyze-black/40">{latest.createdAt.toLocaleDateString('en-US', { timeZone: 'America/New_York' })}</time>}
                  {unread > 0 && <span className="grid min-h-6 min-w-6 place-items-center rounded-full bg-red-600 px-1.5 text-xs font-black text-white" aria-label={`${unread} unread member ${unread === 1 ? 'reply' : 'replies'}`}>{unread}</span>}
                  <span className="text-xs font-black uppercase">Open →</span>
                </span>
              </Link>
            );
          })}
          {!conversations.length && <p className="py-6 text-rhyze-black/45">No member conversations yet.</p>}
        </div>
      </section>
      <section className="mt-8 bg-white p-5">
        <h2 className="font-display text-4xl tracking-wider">CLASS UPDATES</h2>
        <div className="mt-4 divide-y divide-black/10">
          {classMessages.map((item) => (
            <details key={item.id} className="group py-4">
              <summary className="cursor-pointer list-none hover:text-rhyze-coral">
                <strong>{item.subject}</strong>
                <p className="mt-1 text-sm text-rhyze-black/50">{item.occurrence.template.name} · {item.instructor.name} · {item.recipientCount} recipients · Open thread →</p>
              </summary>
              <div className="mt-4 border-l-4 border-rhyze-orange bg-[#f7d8c5] p-4">
                <p className="whitespace-pre-wrap text-sm">{item.body}</p>
                <Link href={`/admin/schedule/${item.occurrenceId}`} className="mt-4 inline-block text-xs font-black uppercase text-rhyze-coral">Open class record →</Link>
              </div>
            </details>
          ))}
          {!classMessages.length && <p className="py-6 text-rhyze-black/45">No class updates have been sent yet.</p>}
        </div>
      </section>
      <section className="mt-6 bg-rhyze-black p-5 text-rhyze-cream">
        <h2 className="font-display text-4xl tracking-wider">CAMPAIGNS</h2>
        <p className="mt-2 text-sm text-rhyze-cream/50">{campaigns.length} saved campaign records. Delivery respects marketing opt-out preferences.</p>
        <Link href="/admin/campaigns" className="mt-5 inline-block border border-rhyze-gold px-4 py-3 text-xs font-black uppercase text-rhyze-gold">Open Campaigns</Link>
      </section>
    </>
  );
}
