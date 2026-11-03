import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { confirmedRosterBookingWhere } from '@/lib/domain/bookings/known-cancellations';
import { deleteOccurrenceAction, cancelOccurrenceAction, cancelSeriesAction, duplicateOccurrenceAction, updateOccurrenceAction } from './actions';
import { instructorPayLabel } from '@/lib/domain/instructors/pay-rates';
import { occurrenceInstructorName, occurrenceLocalInputValue, occurrenceTitle } from '@/lib/domain/schedule/occurrence-management';
import { assignableInstructorWhere, dedupeAssignableInstructors, instructorOptionLabel } from '@/lib/admin/assignable-instructors';

export default async function ManageOccurrencePage(
  props: { params: Promise<{ occurrenceId: string }>; searchParams: Promise<{ saved?: string; cancel?: string; error?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const [item, instructors] = await Promise.all([
    prisma.classOccurrence.findUnique({
      where: { id: params.occurrenceId },
      include: {
        template: true,
        instructor: { include: { instructorProfile: true } },
        _count: { select: { bookings: { where: confirmedRosterBookingWhere() }, waitlistEntries: { where: { status: 'WAITING' } } } },
      },
    }),
    prisma.user.findMany({ where: assignableInstructorWhere, orderBy: { name: 'asc' } }),
  ]);
  if (!item) notFound();
  if (item.archivedAt) return <><h1 className="font-display text-5xl">Date removed from schedule</h1><p className="mt-4">This date is no longer visible or bookable. Historical booking and payment records are retained.</p><Link href="/admin/classes" className="mt-5 inline-block underline">Back to scheduled classes</Link></>;
  const assignableInstructors = dedupeAssignableInstructors(instructors);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Occurrence controls</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{occurrenceTitle(item)}</h1>
      {item.titleOverride && <p className="mt-2 text-sm font-bold text-rhyze-black/55">Template title: {item.template.name}</p>}
      {searchParams.saved && <p className="mt-5 border-l-4 border-rhyze-gold bg-white p-4 font-bold">Class saved.</p>}
      {searchParams.error === 'price' && <p className="mt-5 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">Enter a valid client drop-in price.</p>}
      {searchParams.error === 'instructor' && <p role="alert" className="mt-5 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">Choose an active instructor account with portal access. A display name alone does not assign a class.</p>}
      {searchParams.error === 'duration' && <p role="alert" className="mt-5 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">Enter a whole-number duration from 5 to 480 minutes.</p>}
      {searchParams.error === 'conflict' && <p role="alert" className="mt-5 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">This time overlaps another scheduled class in the same room or with the same instructor. No changes were saved.</p>}
      {searchParams.error?.startsWith('delete-') && <p role="alert" className="mt-5 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">{({ 'delete-stale': 'This class changed while you were reviewing it. Review the current date and time below before trying again.', 'delete-confirm': 'Confirm the specific date and time before deleting.', 'delete-payment': 'An unresolved payment needs review before this date can be deleted. Open the event financial entries; no changes were made.', 'delete-history': 'This date has attendance or imported signup history. Review those records before removing it; no changes were made.', 'delete-missing': 'This date could not be found.' } as Record<string,string>)[searchParams.error] || 'Review this date before deleting.'}</p>}
      <form action={updateOccurrenceAction} className="mt-8 grid gap-4 border-t-4 border-rhyze-gold bg-white p-6 md:grid-cols-2">
        <input type="hidden" name="id" value={item.id}/>
        <Label text="Class title for this date"><input name="titleOverride" defaultValue={item.titleOverride || ''} placeholder={item.template.name} className="min-h-12 border px-3"/></Label>
        <Label text="Instructor"><select name="instructorId" required={item.status === 'SCHEDULED' && item.endAt > new Date()} defaultValue={item.instructorId || ''} className="min-h-12 border px-3"><option value="">Choose an instructor account</option>{item.instructorId && !assignableInstructors.some((user) => user.id === item.instructorId) && <option value={item.instructorId}>Historical assignment — {item.instructor?.name || 'Legacy account'}</option>}{assignableInstructors.map((user) => <option key={user.id} value={user.id}>{instructorOptionLabel(user)}</option>)}</select></Label>
        <Label text="Substitute instructor display"><input name="substituteInstructorName" defaultValue={item.substituteInstructorName || ''} placeholder={occurrenceInstructorName(item)} className="min-h-12 border px-3"/></Label>
        <label className="flex items-center gap-3 border border-rhyze-coral/30 bg-rhyze-coral/10 p-3 text-xs font-black uppercase tracking-widest">
          <input name="isSubstitute" type="checkbox" defaultChecked={item.isSubstitute} className="h-5 w-5"/>
          Show small red Sub box next to instructor name
        </label>
        <Label text="Start"><input name="startAt" type="datetime-local" defaultValue={occurrenceLocalInputValue(item.startAt)} required className="min-h-12 border px-3"/></Label>
        <Label text="Duration for this date (minutes)"><input name="durationMinutes" type="number" min="5" max="480" step="1" defaultValue={(item.endAt.getTime() - item.startAt.getTime()) / 60_000} required className="min-h-12 border px-3"/></Label>
        <Label text="Capacity"><input name="capacity" type="number" min="1" defaultValue={item.capacity} className="min-h-12 border px-3"/></Label>
        <Label text="Client drop-in price">
          <input
            name="dropInPrice"
            type="number"
            min="1"
            step="0.01"
            defaultValue={((item.priceCents ?? item.template.dropInPriceCents ?? 2500) / 100).toFixed(2)}
            className="min-h-12 border px-3"
          />
        </Label>
        <Label text="Public notes"><textarea name="publicNotes" defaultValue={item.publicNotes || ''} className="border p-3"/></Label>
        <Label text="Internal notes"><textarea name="internalNotes" defaultValue={item.internalNotes || ''} className="border p-3"/></Label>
        <Label text="Instructor payment method">
          <select name="instructorPayMethod" defaultValue={item.instructorPayMethod} className="min-h-12 border px-3">
            <option value="STANDARD_CLASS_RATE">Class Rate</option>
            <option value="SPECIALTY_EVENT_RATE">Specialty rate deal</option>
            <option value="CUSTOM_RATE">Custom/edit this class</option>
          </select>
        </Label>
        <Label text="Instructor pay amount">
          <input name="instructorPayAmount" type="number" min="0" step="0.01" defaultValue={item.instructorPayCents === null ? '' : (item.instructorPayCents / 100).toFixed(2)} placeholder="40.00" className="min-h-12 border px-3"/>
        </Label>
        <Label text="Pay note"><textarea name="instructorPayNote" defaultValue={item.instructorPayNote || ''} placeholder="Special event deal, adjusted rate, etc." className="border p-3"/></Label>
        <div className="border border-rhyze-gold/40 bg-[#fff8dc] p-4 text-sm font-bold">
          Current pay: {instructorPayLabel(item.instructorPayMethod)} · {item.instructorPayCents === null ? 'Amount not set' : `$${(item.instructorPayCents / 100).toFixed(2)}`}
        </div>
        <div className="border border-rhyze-gold/40 bg-[#fff8dc] p-4 text-sm font-bold">
          Current client price: ${((item.priceCents ?? item.template.dropInPriceCents ?? 0) / 100).toFixed(2)}
        </div>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">Save occurrence</button>
      </form>
      <div className="mt-5 flex flex-wrap gap-3">
        {item.template.isEvent && (
          <form action={duplicateOccurrenceAction} className="grid gap-2 border border-rhyze-black/20 bg-white p-3 sm:grid-cols-[1fr_auto]">
            <input type="hidden" name="id" value={item.id}/>
            <Label text="Duplicate date/time">
              <input name="duplicateStartAt" type="datetime-local" defaultValue={occurrenceLocalInputValue(new Date(item.startAt.getTime() + 7 * 24 * 60 * 60_000))} required className="min-h-12 border px-3"/>
            </Label>
            <button className="self-end border border-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest">Duplicate</button>
          </form>
        )}
        {item.status === 'SCHEDULED' && <a href="#cancel-class" className="border border-rhyze-coral px-4 py-3 text-xs font-black uppercase tracking-widest text-rhyze-coral">Cancel occurrence</a>}
        {item.seriesId && <form action={cancelSeriesAction}><input type="hidden" name="seriesId" value={item.seriesId}/><button className="bg-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest text-white">Cancel future series</button></form>}
      </div>
      <section id="delete-class" className="mt-8 scroll-mt-8 border-t-4 border-rhyze-coral bg-white p-6">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-rhyze-coral">Delete one scheduled date</p>
        <h2 className="mt-2 font-display text-4xl tracking-wider">Which date are you removing?</h2>
        <p className="mt-3 text-lg font-bold">{occurrenceTitle(item)} · {occurrenceInstructorName(item)}</p>
        <p className="mt-2 text-lg font-bold">{item.startAt.toLocaleString('en-US', { timeZone: item.timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })} – {item.endAt.toLocaleTimeString('en-US', { timeZone: item.timezone, hour: 'numeric', minute: '2-digit' })}</p>
        <p className="mt-3 text-sm">Only this date and time will disappear from the schedule. All other dates for this class stay unchanged. Booking and payment history is retained.</p>
        <p className="mt-3 border-l-4 border-rhyze-gold bg-[#fff8dc] p-4 text-sm font-bold">{item._count.bookings + item._count.waitlistEntries === 0 ? 'No signups: no customer email will be sent.' : `${item._count.bookings} booked · ${item._count.waitlistEntries} waiting. Only these people will be notified. Reserved credits are returned once; cash payments are retained for staff refund review.`}</p>
        <form action={deleteOccurrenceAction} className="mt-5 grid gap-4">
          <input type="hidden" name="id" value={item.id}/>
          <input type="hidden" name="expectedStartAt" value={item.startAt.toISOString()}/>
          <input type="hidden" name="expectedUpdatedAt" value={item.updatedAt.toISOString()}/>
          <label className="flex items-start gap-3 font-bold"><input name="confirmDelete" type="checkbox" value="yes" required className="mt-1 h-5 w-5"/> I confirm: delete only the date and time shown above.</label>
          <button className="min-h-12 bg-rhyze-coral px-5 text-xs font-black uppercase tracking-widest text-white">Delete this date{item._count.bookings + item._count.waitlistEntries ? ' and notify signups' : ' — no email'}</button>
        </form>
        <Link href="/admin/classes#scheduled-classes" className="mt-4 inline-block text-sm font-bold underline">Choose a different date from the schedule</Link>
      </section>
      {item.status === 'SCHEDULED' && (
        <section id="cancel-class" className={`mt-8 border-t-4 border-rhyze-coral bg-white p-6 ${searchParams.cancel ? 'ring-4 ring-rhyze-coral/20' : ''}`}>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-rhyze-coral">Cancel class</p>
          <h2 className="mt-2 font-display text-4xl tracking-wider">Review reason before notifying members</h2>
          <p className="mt-2 text-sm font-bold text-rhyze-black/60">
            Before emails are sent, choose the cancellation reason or write a custom note. {item._count.bookings} confirmed member{item._count.bookings === 1 ? '' : 's'} will receive the approved cancellation email.
          </p>
          <form action={cancelOccurrenceAction} className="mt-5 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="id" value={item.id}/>
            <Label text="Reason to include in email">
              <select name="cancellationReasonType" defaultValue="general" className="min-h-12 border px-3">
                <option value="weather">Weather related</option>
                <option value="instructor">Instructor emergency</option>
                <option value="lowAttendance">Low attendance / 0 signups</option>
                <option value="general">General apology</option>
                <option value="custom">Custom reason</option>
              </select>
            </Label>
            <Label text="Custom reason (optional)">
              <textarea name="customCancellationReason" placeholder="Example: Due to unexpected studio maintenance, we need to cancel this class." className="min-h-24 border p-3" />
            </Label>
            <div className="border border-rhyze-gold/50 bg-[#fff8dc] p-4 text-sm font-bold md:col-span-2">
              Email preview: We need to cancel {item.template.name}. We apologize for the inconvenience and appreciate your understanding. The selected reason will appear here in the email before credit-return language.
            </div>
            <button className="min-h-12 bg-rhyze-coral px-5 text-xs font-black uppercase tracking-widest text-white md:col-span-2">
              {item._count.bookings ? 'Cancel class and notify signups' : 'Cancel class — no email (no signups)'}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
function Label({ text, children }: { text: string; children: React.ReactNode }) { return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">{text}</span>{children}</label>; }
