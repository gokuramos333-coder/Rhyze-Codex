import { notFound } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { memberBookingDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';
import { cancelAssignedClassAction, sendClassMessageAction } from './actions';

export default async function ClassMessagePage(
  props: { params: Promise<{ occurrenceId: string }>; searchParams: Promise<{ sent?: string; error?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const instructor = await requireArea('instructor');
  const occurrence = await prisma.classOccurrence.findFirst({
    where: { id: params.occurrenceId, instructorId: instructor.id },
    include: { template: true, _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } }, classMessages: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  if (!occurrence) notFound();
  const isCancelled = occurrence.status === 'CANCELLED';
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Class communications</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{occurrence.template.name}</h1>
      <p className="mt-3 text-rhyze-black/55">{memberBookingDateTimeLabel(occurrence)} · {occurrence._count.bookings} confirmed recipients</p>
      {isCancelled && <p className="mt-5 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">This class is already canceled. Members can no longer book it.</p>}
      {searchParams.sent && <p className="mt-5 border-l-4 border-rhyze-gold bg-white p-4 font-bold">Update queued by email and delivered to member inboxes.</p>}
      {searchParams.error && <p className="mt-5 border-l-4 border-rhyze-coral bg-white p-4 font-bold text-rhyze-coral">Choose a cancellation reason or add a clear subject and message of at least 10 characters.</p>}
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <form action={sendClassMessageAction} className="grid gap-4 border-t-4 border-rhyze-gold bg-white p-6"><input type="hidden" name="occurrenceId" value={occurrence.id}/><h2 className="font-display text-4xl tracking-wider">SEND UPDATE</h2><label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">Subject</span><input name="subject" required className="min-h-12 border px-3"/></label><label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">Message</span><textarea name="body" required rows={7} className="border p-3"/></label><button className="min-h-12 bg-rhyze-gradient px-4 text-xs font-black uppercase tracking-widest">Notify confirmed attendees</button></form>
        {isCancelled ? (
          <section className="grid content-start gap-4 border-t-4 border-red-700 bg-white p-6">
            <h2 className="font-display text-4xl tracking-wider">CLASS CANCELED</h2>
            <p className="text-sm font-bold text-red-900">This class is already canceled. No additional cancellation emails will be sent from this panel.</p>
          </section>
        ) : (
          <form action={cancelAssignedClassAction} className="grid content-start gap-4 border-t-4 border-rhyze-coral bg-white p-6">
            <input type="hidden" name="occurrenceId" value={occurrence.id}/>
            <h2 className="font-display text-4xl tracking-wider">EMERGENCY CANCELLATION</h2>
            <p className="text-sm text-rhyze-black/55">Before emails are sent, choose the reason or write your own note. This cancels the occurrence, restores reserved credits, and notifies every confirmed attendee with the approved cancellation email.</p>
            <label className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-widest">Reason to include in email</span>
              <select name="cancellationReasonType" defaultValue="instructor" className="min-h-12 border px-3">
                <option value="weather">Weather related</option>
                <option value="instructor">Instructor emergency</option>
                <option value="general">General apology</option>
                <option value="custom">Custom reason</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-widest">Custom reason (optional)</span>
              <textarea name="customCancellationReason" rows={5} placeholder="Example: I apologize for the inconvenience, but due to an emergency I need to cancel today’s class." className="border p-3"/>
            </label>
            <div className="border border-rhyze-gold/50 bg-[#fff8dc] p-4 text-sm font-bold">
              Email preview: We need to cancel {occurrence.template.name}. We apologize for the inconvenience and appreciate your understanding. The selected or custom reason will appear in the email before credit-return language.
            </div>
            <button className="min-h-12 border border-rhyze-coral px-4 text-xs font-black uppercase tracking-widest text-rhyze-coral">Cancel class and send approved email</button>
          </form>
        )}
      </div>
      <section className="mt-10"><h2 className="font-display text-4xl tracking-wider">MESSAGE HISTORY</h2><div className="mt-4 grid gap-3">{occurrence.classMessages.map((item) => <article key={item.id} className="bg-white p-5"><strong>{item.subject}</strong><p className="mt-2 text-sm text-rhyze-black/60">{item.body}</p><small>{item.recipientCount} recipients · {item.createdAt.toLocaleString()}</small></article>)}{occurrence.classMessages.length === 0 && <p className="bg-white p-6 text-rhyze-black/55">No class updates sent.</p>}</div></section>
    </>
  );
}
