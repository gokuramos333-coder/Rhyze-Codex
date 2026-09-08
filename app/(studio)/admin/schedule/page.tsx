import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { createOccurrenceAction, createRecurringOccurrencesAction } from '../classes/actions';
import { occurrenceInstructorName, occurrenceLocalTimeZone, occurrenceTitle } from '@/lib/domain/schedule/occurrence-management';
import { assignableInstructorWhere, dedupeAssignableInstructors, instructorOptionLabel } from '@/lib/admin/assignable-instructors';

export default async function AdminSchedulePage(
  props: {
    searchParams: Promise<{ saved?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const [occurrences, templates, instructors] = await Promise.all([
    prisma.classOccurrence.findMany({
      include: { template: true, instructor: true, room: true },
      orderBy: { startAt: 'asc' },
      take: 80,
    }),
    prisma.classTemplate.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: assignableInstructorWhere, orderBy: { name: 'asc' } }),
  ]);
  const assignableInstructors = dedupeAssignableInstructors(instructors);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Calendar</p>
          <h1 className="mt-3 font-display text-6xl tracking-wider">SCHEDULE</h1>
        </div>
        <Link href="/schedule" className="border border-rhyze-black px-4 py-2 text-xs font-black uppercase tracking-widest">
          Open public schedule
        </Link>
      </div>
      <p className="mt-5 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-4 text-sm font-bold">
        Low attendance rule: cancel classes with 0 signups 2 hours before class start so no one can book last-minute.
      </p>
      {searchParams.error && (
        <p className="mt-5 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-4 text-sm font-bold">
          {searchParams.error === 'conflict' ? 'That room or instructor already has a class at this time.' : 'Check the schedule details.'}
        </p>
      )}

      <form action={createOccurrenceAction} className="mt-8 grid gap-4 border-t-4 border-rhyze-gold bg-white p-6 md:grid-cols-2">
        <Select name="templateId" label="Class" options={templates.map((item) => [item.id, item.name])} />
        <Select name="instructorId" label="Instructor" options={assignableInstructors.map((item) => [item.id, instructorOptionLabel(item)])} />
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-widest">Start date and time</span>
          <input type="datetime-local" name="startAt" required className="min-h-12 border px-3" />
        </label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">
          Add class occurrence
        </button>
      </form>
      <form action={createRecurringOccurrencesAction} className="mt-5 grid gap-4 border-t-4 border-rhyze-coral bg-white p-6 md:grid-cols-2">
        <div className="md:col-span-2"><h2 className="font-display text-3xl tracking-wider">RECURRING SERIES</h2><p className="text-sm text-rhyze-black/55">Create the same class weekly while preserving Lafayette local time through daylight saving changes.</p></div>
        <Select name="templateId" label="Class" options={templates.map((item) => [item.id, item.name])} />
        <Select name="instructorId" label="Instructor" options={assignableInstructors.map((item) => [item.id, instructorOptionLabel(item)])} />
        <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">First class</span><input type="datetime-local" name="startAt" required className="min-h-12 border px-3"/></label>
        <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">Number of weeks</span><input type="number" name="count" defaultValue="6" min="2" max="52" className="min-h-12 border px-3"/></label>
        <button className="min-h-12 bg-rhyze-black px-5 text-xs font-black uppercase tracking-widest text-white md:col-span-2">Create weekly series</button>
      </form>

      <div className="mt-8 grid gap-3">
        {occurrences.map((occurrence) => (
          <div
            key={occurrence.id}
            className="grid gap-3 border-l-4 border-rhyze-orange bg-white p-5 md:grid-cols-[10rem_1fr_auto] md:items-center"
          >
            <strong>{occurrence.startAt.toLocaleString('en-US', { timeZone: occurrenceLocalTimeZone(), month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong>
            <span>
              <strong className="block font-display text-2xl tracking-wider">{occurrenceTitle(occurrence)}</strong>
              <span className="text-sm text-rhyze-black/50">{occurrenceInstructorName(occurrence)}{occurrence.isSubstitute ? <span className="ml-2 rounded bg-rhyze-coral px-1.5 py-0.5 text-[10px] font-black text-white">SUB</span> : null} · {occurrence.room?.name || 'TBA'}</span>
            </span>
            <span className="flex flex-wrap gap-3 text-xs font-black uppercase tracking-widest">
              <Link href={`/admin/schedule/${occurrence.id}`} className="text-rhyze-coral">Manage</Link>
              {occurrence.status === 'SCHEDULED' && (
                <Link href={`/admin/schedule/${occurrence.id}?cancel=1`} className="text-rhyze-coral">Cancel class</Link>
              )}
              <Link href={`/admin/schedule/${occurrence.id}/roster`}>Roster</Link>
              <Link href={`/schedule/${occurrence.id}`}>Public view</Link>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Select({ name, label, options }: { name: string; label: string; options: string[][] }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      <select name={name} className="min-h-12 border px-3">
        <option value="">Select {label.toLowerCase()}</option>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );
}
