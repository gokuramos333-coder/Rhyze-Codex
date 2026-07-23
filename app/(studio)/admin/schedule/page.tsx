import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { createOccurrenceAction } from '../classes/actions';

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const [occurrences, templates, instructors, rooms] = await Promise.all([
    prisma.classOccurrence.findMany({
      include: { template: true, instructor: true, room: true },
      orderBy: { startAt: 'asc' },
      take: 80,
    }),
    prisma.classTemplate.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { role: 'INSTRUCTOR' }, orderBy: { name: 'asc' } }),
    prisma.room.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);

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
      {searchParams.error && (
        <p className="mt-5 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-4 text-sm font-bold">
          {searchParams.error === 'conflict' ? 'That room or instructor already has a class at this time.' : 'Check the schedule details.'}
        </p>
      )}

      <form action={createOccurrenceAction} className="mt-8 grid gap-4 border-t-4 border-rhyze-gold bg-white p-6 md:grid-cols-2">
        <Select name="templateId" label="Class" options={templates.map((item) => [item.id, item.name])} />
        <Select name="instructorId" label="Instructor" options={instructors.map((item) => [item.id, item.name || item.email])} />
        <Select name="roomId" label="Room" options={rooms.map((item) => [item.id, item.name])} />
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-widest">Start date and time</span>
          <input type="datetime-local" name="startAt" required className="min-h-12 border px-3" />
        </label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">
          Add class occurrence
        </button>
      </form>

      <div className="mt-8 grid gap-3">
        {occurrences.map((occurrence) => (
          <Link
            key={occurrence.id}
            href={`/schedule/${occurrence.id}`}
            className="grid gap-3 border-l-4 border-rhyze-orange bg-white p-5 md:grid-cols-[10rem_1fr_auto] md:items-center"
          >
            <strong>{occurrence.startAt.toLocaleString('en-US', { timeZone: occurrence.timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong>
            <span>
              <strong className="block font-display text-2xl tracking-wider">{occurrence.template.name}</strong>
              <span className="text-sm text-rhyze-black/50">{occurrence.instructor?.name || 'TBA'} · {occurrence.room?.name || 'TBA'}</span>
            </span>
            <span className="text-xs font-black uppercase tracking-widest">{occurrence.status}</span>
          </Link>
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
