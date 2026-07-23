import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { cancelOccurrenceAction, cancelSeriesAction, duplicateOccurrenceAction, updateOccurrenceAction } from './actions';

function localInput(date: Date) {
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return formatter.format(date).replace(' ', 'T');
}

export default async function ManageOccurrencePage({ params, searchParams }: { params: { occurrenceId: string }; searchParams: { saved?: string } }) {
  const [item, instructors, rooms] = await Promise.all([
    prisma.classOccurrence.findUnique({ where: { id: params.occurrenceId }, include: { template: true } }),
    prisma.user.findMany({ where: { role: 'INSTRUCTOR' }, orderBy: { name: 'asc' } }),
    prisma.room.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);
  if (!item) notFound();
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Occurrence controls</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{item.template.name}</h1>
      {searchParams.saved && <p className="mt-5 border-l-4 border-rhyze-gold bg-white p-4 font-bold">Class saved.</p>}
      <form action={updateOccurrenceAction} className="mt-8 grid gap-4 border-t-4 border-rhyze-gold bg-white p-6 md:grid-cols-2">
        <input type="hidden" name="id" value={item.id}/>
        <Label text="Instructor"><select name="instructorId" defaultValue={item.instructorId || ''} className="min-h-12 border px-3"><option value="">TBA</option>{instructors.map((user) => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</select></Label>
        <Label text="Room"><select name="roomId" defaultValue={item.roomId || ''} className="min-h-12 border px-3"><option value="">TBA</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></Label>
        <Label text="Start"><input name="startAt" type="datetime-local" defaultValue={localInput(item.startAt)} required className="min-h-12 border px-3"/></Label>
        <Label text="Capacity"><input name="capacity" type="number" min="1" defaultValue={item.capacity} className="min-h-12 border px-3"/></Label>
        <Label text="Public notes"><textarea name="publicNotes" defaultValue={item.publicNotes || ''} className="border p-3"/></Label>
        <Label text="Internal notes"><textarea name="internalNotes" defaultValue={item.internalNotes || ''} className="border p-3"/></Label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">Save occurrence</button>
      </form>
      <div className="mt-5 flex flex-wrap gap-3">
        <form action={duplicateOccurrenceAction}><input type="hidden" name="id" value={item.id}/><button className="border border-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest">Duplicate next week</button></form>
        <form action={cancelOccurrenceAction}><input type="hidden" name="id" value={item.id}/><button className="border border-rhyze-coral px-4 py-3 text-xs font-black uppercase tracking-widest text-rhyze-coral">Cancel occurrence</button></form>
        {item.seriesId && <form action={cancelSeriesAction}><input type="hidden" name="seriesId" value={item.seriesId}/><button className="bg-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest text-white">Cancel future series</button></form>}
      </div>
    </>
  );
}
function Label({ text, children }: { text: string; children: React.ReactNode }) { return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">{text}</span>{children}</label>; }
