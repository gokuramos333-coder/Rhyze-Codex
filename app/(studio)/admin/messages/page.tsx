import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';

export default async function AdminMessagesPage() {
  const [emails, classMessages, campaigns] = await Promise.all([
    prisma.emailMessage.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
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

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Communications</p>
          <h1 className="mt-3 font-display text-6xl tracking-wider">MESSAGES</h1>
        </div>
        <Link href="/admin/campaigns" className="bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase">Create Announcement</Link>
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="bg-white p-5">
          <h2 className="font-display text-4xl tracking-wider">EMAIL QUEUE</h2>
          <div className="mt-4 divide-y divide-black/10">
            {emails.map((item) => (
              <article key={item.id} className="py-4">
                <div className="flex justify-between gap-4"><strong>{item.subject}</strong><span className="text-xs font-black uppercase text-rhyze-coral">{item.status}</span></div>
                <p className="mt-1 text-sm text-rhyze-black/50">To {item.user?.name || item.to} · {item.template}</p>
              </article>
            ))}
            {!emails.length && <p className="py-6 text-rhyze-black/45">No transactional email has been queued yet.</p>}
          </div>
        </section>
        <section className="bg-white p-5">
          <h2 className="font-display text-4xl tracking-wider">CLASS UPDATES</h2>
          <div className="mt-4 divide-y divide-black/10">
            {classMessages.map((item) => (
              <Link href={`/admin/schedule/${item.occurrenceId}`} key={item.id} className="block py-4 hover:text-rhyze-coral">
                <strong>{item.subject}</strong>
                <p className="mt-1 text-sm text-rhyze-black/50">{item.occurrence.template.name} · {item.instructor.name} · {item.recipientCount} recipients</p>
              </Link>
            ))}
            {!classMessages.length && <p className="py-6 text-rhyze-black/45">No class updates have been sent yet.</p>}
          </div>
        </section>
      </div>
      <section className="mt-6 bg-rhyze-black p-5 text-rhyze-cream">
        <h2 className="font-display text-4xl tracking-wider">CAMPAIGNS</h2>
        <p className="mt-2 text-sm text-rhyze-cream/50">{campaigns.length} saved campaign records. Delivery respects marketing opt-out preferences.</p>
        <Link href="/admin/campaigns" className="mt-5 inline-block border border-rhyze-gold px-4 py-3 text-xs font-black uppercase text-rhyze-gold">Open Campaigns</Link>
      </section>
    </>
  );
}
