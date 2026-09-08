import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { updateProductAction } from '../actions';

const kinds = ['INTRO_TRIAL','MONTHLY_UNLIMITED','LIMITED_MEMBERSHIP','CLASS_PACK','DROP_IN','VIP','CUSTOM'];
const intervals = ['ONE_TIME','MONTHLY','YEARLY'];
const dateValue = (value: Date | null) => value ? value.toISOString().slice(0, 10) : '';

export default async function EditMembershipPage(
  props: { params: Promise<{ productId: string }>; searchParams: Promise<{ saved?: string; error?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const product = await prisma.product.findUnique({ where: { id: params.productId } });
  if (!product) notFound();
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Membership catalog</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">EDIT {product.name}</h1>
      {searchParams.saved && <p className="mt-5 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">Membership saved and synchronized.</p>}
      <form action={updateProductAction} className="mt-8 grid gap-4 border-t-4 border-rhyze-orange bg-white p-6 md:grid-cols-2">
        <input type="hidden" name="id" value={product.id} />
        <Field name="name" label="Title" value={product.name} required />
        <Field name="price" label="Cost (USD)" type="number" value={String(product.priceCents / 100)} required />
        <Select name="kind" label="Plan type" values={kinds} value={product.customPlanType ? 'CUSTOM' : product.kind} />
        <Field name="customPlanType" label="New plan type (when Custom is selected)" value={product.customPlanType || ''} />
        <Select name="billingInterval" label="Billing frequency" values={intervals} value={product.billingInterval} />
        <Field name="credits" label="Included credits" type="number" value={product.includedCredits == null ? '' : String(product.includedCredits)} />
        <Field name="trialDays" label="Trial days" type="number" value={product.trialDays == null ? '' : String(product.trialDays)} />
        <Field name="availabilityStart" label="Available from" type="date" value={dateValue(product.availabilityStart)} />
        <Field name="availabilityEnd" label="Available through" type="date" value={dateValue(product.availabilityEnd)} />
        <label className="grid gap-2 md:col-span-2"><Span>Full website description</Span><textarea name="description" defaultValue={product.description} required className="min-h-40 border p-3" /></label>
        <label className="grid gap-2 md:col-span-2"><Span>Cancellation rules</Span><textarea name="cancellationPolicy" defaultValue={product.cancellationPolicy || ''} className="min-h-24 border p-3" /></label>
        <Check name="isUnlimited" label="Unlimited access" checked={product.isUnlimited} />
        <Check name="alwaysAvailable" label="Always available" checked={product.alwaysAvailable} />
        <Check name="isPublic" label="Visible on website" checked={product.isPublic} />
        <Check name="isActive" label="Active" checked={product.isActive} />
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">Save and synchronize membership</button>
      </form>
    </>
  );
}

function Span({ children }: { children: React.ReactNode }) { return <span className="text-xs font-black uppercase tracking-widest">{children}</span>; }
function Field({ name, label, value = '', type = 'text', required = false }: { name: string; label: string; value?: string; type?: string; required?: boolean }) { return <label className="grid gap-2"><Span>{label}</Span><input name={name} defaultValue={value} type={type} required={required} step={type === 'number' ? '0.01' : undefined} className="min-h-12 border px-3" /></label>; }
function Select({ name, label, values, value }: { name: string; label: string; values: string[]; value: string }) { return <label className="grid gap-2"><Span>{label}</Span><select name={name} defaultValue={value} className="min-h-12 border px-3">{values.map((item) => <option key={item}>{item}</option>)}</select></label>; }
function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) { return <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name={name} defaultChecked={checked} /> {label}</label>; }
