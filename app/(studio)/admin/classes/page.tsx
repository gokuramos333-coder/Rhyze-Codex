import { prisma } from '@/lib/db/prisma';
import {
  archiveClassTemplateAction,
  createClassTemplateAction,
} from './actions';

export default async function AdminClassesPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const [templates, categories] = await Promise.all([
    prisma.classTemplate.findMany({
      include: { category: true, _count: { select: { occurrences: true } } },
      orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
    }),
    prisma.classCategory.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Catalog
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">
        CLASS TEMPLATES
      </h1>
      {searchParams.saved && <Notice text="Class template saved." />}
      {searchParams.error && <Notice text="Check the class details." error />}

      <form
        action={createClassTemplateAction}
        className="mt-8 grid gap-4 border-t-4 border-rhyze-coral bg-white p-6 md:grid-cols-2"
      >
        <Input name="name" label="Class name" />
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-widest">Category</span>
          <select name="categoryId" required className="min-h-12 border px-3">
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <Input name="durationMinutes" label="Duration (minutes)" type="number" value="50" />
        <Input name="defaultCapacity" label="Default capacity" type="number" value="20" />
        <Input name="dropInPrice" label="Drop-in price" type="number" value="28" />
        <label className="grid gap-2 md:col-span-2">
          <span className="text-xs font-black uppercase tracking-widest">Description</span>
          <textarea name="description" required className="min-h-28 border p-3" />
        </label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">
          Add class template
        </button>
      </form>

      <div className="mt-8 grid gap-3">
        {templates.map((template) => (
          <article key={template.id} className="grid gap-3 bg-white p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">
                {template.category.name} · {template.durationMinutes} min
              </p>
              <h2 className="mt-1 font-display text-3xl tracking-wider">{template.name}</h2>
              <p className="mt-1 text-sm text-rhyze-black/55">
                {template._count.occurrences} scheduled · {template.defaultCapacity} spots ·
                {' '}${((template.dropInPriceCents || 0) / 100).toFixed(0)}
              </p>
            </div>
            {template.isActive ? (
              <form action={archiveClassTemplateAction}>
                <input type="hidden" name="id" value={template.id} />
                <button className="border border-rhyze-coral px-4 py-2 text-xs font-black uppercase tracking-widest text-rhyze-coral">
                  Archive
                </button>
              </form>
            ) : (
              <span className="text-xs font-black uppercase tracking-widest text-rhyze-black/35">Archived</span>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function Input({ name, label, type = 'text', value }: { name: string; label: string; type?: string; value?: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      <input name={name} type={type} required defaultValue={value} className="min-h-12 border px-3" />
    </label>
  );
}

function Notice({ text, error = false }: { text: string; error?: boolean }) {
  return <p className={`mt-5 border-l-4 p-4 text-sm font-bold ${error ? 'border-rhyze-coral bg-rhyze-coral/10' : 'border-emerald-600 bg-emerald-50'}`}>{text}</p>;
}
