import { prisma } from '@/lib/db/prisma';
import { createProductAction, toggleProductAction } from './actions';

export default async function AdminProductsPage() {
  const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Commerce catalog</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">PRODUCTS</h1>
      <form action={createProductAction} className="mt-8 grid gap-4 border-t-4 border-rhyze-gold bg-white p-6 md:grid-cols-2">
        <Field name="name" label="Plan name" required />
        <Field name="price" label="Price (USD)" type="number" required />
        <Select name="kind" label="Plan type" values={['INTRO_TRIAL','MONTHLY_UNLIMITED','LIMITED_MEMBERSHIP','CLASS_PACK','DROP_IN','VIP']} />
        <Select name="billingInterval" label="Billing" values={['ONE_TIME','MONTHLY','YEARLY']} />
        <Field name="credits" label="Included credits" type="number" />
        <Field name="description" label="Description" required />
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isUnlimited" /> Unlimited access</label>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isPublic" defaultChecked /> Publicly visible</label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">Create product</button>
      </form>
      <div className="mt-8 grid gap-3 lg:grid-cols-2">
        {products.map((product) => (
          <article key={product.id} className="border-l-4 border-rhyze-orange bg-white p-5">
            <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">{product.kind.replaceAll('_',' ')}</p>
            <h2 className="mt-2 font-display text-3xl tracking-wider">{product.name}</h2>
            <p className="mt-2 text-sm text-rhyze-black/55">${(product.priceCents / 100).toFixed(2)} · {product.billingInterval.replace('_',' ')}</p>
            <form action={toggleProductAction} className="mt-4">
              <input type="hidden" name="id" value={product.id} />
              <button className="border border-rhyze-black px-3 py-2 text-xs font-black uppercase tracking-widest">{product.isActive ? 'Deactivate' : 'Activate'}</button>
            </form>
          </article>
        ))}
      </div>
    </>
  );
}

function Field({ name, label, type = 'text', required = false }: { name: string; label: string; type?: string; required?: boolean }) {
  return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">{label}</span><input name={name} type={type} required={required} className="min-h-12 border px-3" /></label>;
}
function Select({ name, label, values }: { name: string; label: string; values: string[] }) {
  return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">{label}</span><select name={name} className="min-h-12 border px-3">{values.map((value) => <option key={value}>{value}</option>)}</select></label>;
}
