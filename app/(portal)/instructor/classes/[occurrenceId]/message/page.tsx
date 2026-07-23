import { notFound } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { cancelAssignedClassAction, sendClassMessageAction } from './actions';

export default async function ClassMessagePage({ params, searchParams }: { params: { occurrenceId: string }; searchParams: { sent?: string; error?: string } }) {
  const instructor = await requireArea('instructor');
  const occurrence = await prisma.classOccurrence.findFirst({
    where: { id: params.occurrenceId, instructorId: instructor.id },
    include: { template: true, _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } }, classMessages: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  if (!occurrence) notFound();
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Class communications</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{occurrence.template.name}</h1>
      <p className="mt-3 text-rhyze-black/55">{occurrence.startAt.toLocaleString()} · {occurrence._count.bookings} confirmed recipients</p>
      {searchParams.sent && <p className="mt-5 border-l-4 border-rhyze-gold bg-white p-4 font-bold">Update queued by email and delivered to member inboxes.</p>}
      {searchParams.error && <p className="mt-5 border-l-4 border-rhyze-coral bg-white p-4 font-bold text-rhyze-coral">Add a clear subject and message of at least 10 characters.</p>}
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <form action={sendClassMessageAction} className="grid gap-4 border-t-4 border-rhyze-gold bg-white p-6"><input type="hidden" name="occurrenceId" value={occurrence.id}/><h2 className="font-display text-4xl tracking-wider">SEND UPDATE</h2><label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">Subject</span><input name="subject" required className="min-h-12 border px-3"/></label><label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">Message</span><textarea name="body" required rows={7} className="border p-3"/></label><button className="min-h-12 bg-rhyze-gradient px-4 text-xs font-black uppercase tracking-widest">Notify confirmed attendees</button></form>
        <form action={cancelAssignedClassAction} className="grid content-start gap-4 border-t-4 border-rhyze-coral bg-white p-6"><input type="hidden" name="occurrenceId" value={occurrence.id}/><h2 className="font-display text-4xl tracking-wider">EMERGENCY CANCELLATION</h2><p className="text-sm text-rhyze-black/55">Cancels this occurrence, restores reserved credits, and notifies every confirmed attendee.</p><label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">Reason</span><textarea name="reason" required rows={5} className="border p-3"/></label><button className="min-h-12 border border-rhyze-coral px-4 text-xs font-black uppercase tracking-widest text-rhyze-coral">Cancel class and notify</button></form>
      </div>
      <section className="mt-10"><h2 className="font-display text-4xl tracking-wider">MESSAGE HISTORY</h2><div className="mt-4 grid gap-3">{occurrence.classMessages.map((item) => <article key={item.id} className="bg-white p-5"><strong>{item.subject}</strong><p className="mt-2 text-sm text-rhyze-black/60">{item.body}</p><small>{item.recipientCount} recipients · {item.createdAt.toLocaleString()}</small></article>)}{occurrence.classMessages.length === 0 && <p className="bg-white p-6 text-rhyze-black/55">No class updates sent.</p>}</div></section>
    </>
  );
}
