import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { updateClassTemplateAction } from './actions';

export default async function EditTemplatePage({ params, searchParams }: { params: { templateId: string }; searchParams: { saved?: string } }) {
  const [item, categories] = await Promise.all([
    prisma.classTemplate.findUnique({ where: { id: params.templateId } }),
    prisma.classCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
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
        <Field name="dropInPrice" label="Drop-in price" type="number" value={String((item.dropInPriceCents || 0)/100)}/>
        <label className="grid gap-2"><Span>Intensity</Span><select name="intensity" defaultValue={item.intensity} className="min-h-12 border px-3">{['LOW','MODERATE','HIGH','ALL_LEVELS'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <Field name="imageUrl" label="Image path / URL" value={item.imageUrl || ''}/>
        <Field name="tags" label="Tags (comma separated)" value={item.tags.join(', ')}/>
        <Field name="equipment" label="Equipment (comma separated)" value={item.equipment.join(', ')}/>
        <label className="grid gap-2 md:col-span-2"><Span>Description</Span><textarea name="description" defaultValue={item.description} required className="min-h-28 border p-3"/></label>
        <label className="grid gap-2 md:col-span-2"><Span>Cancellation policy</Span><textarea name="cancellationPolicy" defaultValue={item.cancellationPolicy || ''} className="border p-3"/></label>
        <label className="flex items-center gap-2 text-sm font-bold"><input name="isActive" type="checkbox" defaultChecked={item.isActive}/> Active</label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">Save class template</button>
      </form>
    </>
  );
}
function Span({ children }: { children: React.ReactNode }) { return <span className="text-xs font-black uppercase tracking-widest">{children}</span>; }
function Field({ name, label, value, type = 'text' }: { name: string; label: string; value: string; type?: string }) { return <label className="grid gap-2"><Span>{label}</Span><input name={name} defaultValue={value} type={type} required className="min-h-12 border px-3"/></label>; }
