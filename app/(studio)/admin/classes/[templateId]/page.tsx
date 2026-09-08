import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import {
  assignTemplateInstructorAction,
  updateClassTemplateAction,
} from './actions';
import { occurrenceLocalTimeZone } from '@/lib/domain/schedule/occurrence-management';

export default async function EditTemplatePage(
  props: { params: Promise<{ templateId: string }>; searchParams: Promise<{ saved?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const [item, categories, instructors] = await Promise.all([
    prisma.classTemplate.findUnique({
      where: { id: params.templateId },
      include: {
        occurrences: {
          orderBy: { startAt: 'asc' },
          include: {
            instructor: { select: { id: true, name: true } },
            _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
          },
        },
      },
    }),
    prisma.classCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({
      where: { instructorProfile: { isNot: null }, status: 'ACTIVE' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  if (!item) notFound();
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Class catalog</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">EDIT {item.name}</h1>
      {searchParams.saved && <p className="mt-5 border-l-4 border-rhyze-gold bg-white p-4 font-bold">Template updated.</p>}
      <form action={updateClassTemplateAction} className="mt-8 grid gap-4 border-t-4 border-rhyze-coral bg-white p-6 md:grid-cols-2">
        <input type="hidden" name="id" value={item.id}/>
        <Field name="name" label="Name" value={item.name}/>
        <label className="grid gap-2"><Span>Category</Span><select name="categoryId" defaultValue={item.categoryId} className="min-h-12 border px-3">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <Field name="durationMinutes" label="Duration" type="number" value={String(item.durationMinutes)}/>
        <Field name="defaultCapacity" label="Capacity" type="number" value={String(item.defaultCapacity)}/>
        <Field name="dropInPrice" label="Drop-in price" type="number" value={String((item.dropInPriceCents || 2500)/100)} min="1" step="0.01"/>
        <label className="grid gap-2"><Span>Intensity</Span><select name="intensity" defaultValue={item.intensity} className="min-h-12 border px-3">{['LOW','MODERATE','HIGH','ALL_LEVELS'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <Field name="imageUrl" label="Image path / URL" value={item.imageUrl || ''} required={false}/>
        <label className="grid gap-2"><Span>Upload photo</Span><input name="image" type="file" accept="image/jpeg,image/png" className="min-h-12 border bg-rhyze-orange/10 p-3" /></label>
        <Field name="tags" label="Tags (comma separated)" value={item.tags.join(', ')}/>
        <Field name="equipment" label="Equipment (comma separated)" value={item.equipment.join(', ')}/>
        <label className="grid gap-2 md:col-span-2"><Span>Description</Span><textarea name="description" defaultValue={item.description} required className="min-h-28 border p-3"/></label>
        <label className="grid gap-2 md:col-span-2"><Span>Cancellation policy</Span><textarea name="cancellationPolicy" defaultValue={item.cancellationPolicy || ''} className="border p-3"/></label>
        <label className="flex items-center gap-2 text-sm font-bold"><input name="isActive" type="checkbox" defaultChecked={item.isActive}/> Active</label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">Save class template</button>
      </form>
      <form
        action={assignTemplateInstructorAction}
        className="mt-8 grid gap-4 border-t-4 border-rhyze-orange bg-white p-6 md:grid-cols-[1fr_auto] md:items-end"
      >
        <input type="hidden" name="templateId" value={item.id} />
        <label className="grid gap-2">
          <Span>Instructor for every scheduled date</Span>
          <select
            name="instructorId"
            defaultValue={item.occurrences[0]?.instructor?.id || ''}
            className="min-h-12 border px-3"
          >
            <option value="">Instructor TBA</option>
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.name || instructor.email}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-12 bg-rhyze-black px-5 text-xs font-black uppercase tracking-widest text-white">
          Sync instructor
        </button>
      </form>
      <section className="mt-8 border-t-4 border-rhyze-gold bg-white p-6">
        <h2 className="font-display text-4xl tracking-wider">SCHEDULED DATES</h2>
        <div className="mt-4 grid gap-2">
          {item.occurrences.map((occurrence) => (
            <div key={occurrence.id} className="grid gap-2 border-b border-black/10 py-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
              <strong>{occurrence.startAt.toLocaleString('en-US', { timeZone: occurrenceLocalTimeZone(), dateStyle: 'full', timeStyle: 'short' })}</strong>
              <span className="text-sm text-rhyze-black/55">{occurrence.instructor?.name || 'Instructor TBA'} · {occurrence._count.bookings + occurrence.historicalSignupCount}/{occurrence.capacity} signups</span>
              <span className="flex gap-2">
                <Link href={`/admin/schedule/${occurrence.id}/roster`} className="border border-rhyze-orange px-3 py-2 text-xs font-black uppercase text-rhyze-coral">Attendees</Link>
                <Link href={`/admin/schedule/${occurrence.id}`} className="border border-rhyze-black px-3 py-2 text-xs font-black uppercase">Edit date</Link>
              </span>
            </div>
          ))}
          {!item.occurrences.length && <p className="text-rhyze-black/55">No dates scheduled. Add one from Admin → Schedule.</p>}
        </div>
      </section>
    </>
  );
}
function Span({ children }: { children: React.ReactNode }) { return <span className="text-xs font-black uppercase tracking-widest">{children}</span>; }
function Field({ name, label, value, type = 'text', required = true, min, step }: { name: string; label: string; value: string; type?: string; required?: boolean; min?: string; step?: string }) { return <label className="grid gap-2"><Span>{label}</Span><input name={name} defaultValue={value} type={type} required={required} min={min} step={step} className="min-h-12 border px-3"/></label>; }
