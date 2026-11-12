'use client';
import { startTransition, useActionState, useState } from 'react';
export type DiscountAction = (data: FormData) => Promise<void | {error:string}>;
export function DiscountCampaignForm({ products, action }: { products: { id: string; name: string }[]; action: DiscountAction }) {
  // Dispatch explicitly: React's form action reset also runs on returned validation errors.
  const empty = { code: '', discountKind: 'PERCENT', percentOff: '', amountOff: '', startsAt: '', endsAt: '', productIds: [] as string[] };
  const [values, setValues] = useState(empty);
  const [result, submit, pending] = useActionState(async (_previous: {error:string}|null, data:FormData) => {
    const response = await action(data);
    if (!response?.error) setValues(empty);
    return response || null;
  }, null);
  return <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(() => submit(data)); }} className="grid min-w-0 gap-4 rounded border bg-white p-5">
    {result?.error && <p role="alert" className="border border-red-500 p-3">{result.error}</p>}
    <h2 className="text-2xl font-bold">Create discount code</h2>
    <p role="note">Codes start disabled. Review the dates, discount and eligible products, then enable the code when you are ready to share it.</p>
    <p>First payment only: first monthly payment or one-time class pack. Renewals return to regular price. Exact percentage in cents, not whole-dollar rounding.</p>
    <p>No stacking. Instructor referrals remain separate. One use per customer per sale. A different sale can be used later. Refunded redemptions remain used pending a separate policy decision.</p>
    <p>Redemption times are America/New_York. New checkouts stop at the exact advertised end. Checkouts authorized before closing can finish until 30 minutes after the sale closes, or their original session expiry if earlier (sessions last at most 24 hours). Finish means completing Checkout, not bank settlement or webhook arrival. Disabling does not revoke existing valid sessions; it stops new admissions. Legitimate completed payments can settle later.</p>
    <p>Fixed amounts are in USD; commercial discounts cannot make memberships or packages free. Birthday class/event gifts are separate. Multiple-month discounts are deferred. Terms cannot be edited after creation; create a new disabled code instead.</p>
    <label className="grid gap-1">Code<input required name="code" value={values.code} onChange={e => setValues(v => ({...v, code: e.target.value}))} minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" className="min-w-0 border p-2" /></label>
    <label className="grid gap-1">Discount type<select name="discountKind" value={values.discountKind} onChange={e => setValues(v => ({...v,discountKind:e.target.value}))} className="border p-2"><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount (USD)</option></select></label>
    {values.discountKind === 'PERCENT' ? <label className="grid gap-1">Percent off<input required name="percentOff" value={values.percentOff} onChange={e => setValues(v => ({...v, percentOff: e.target.value}))} type="number" min={1} max={99} step={1} className="border p-2" /></label> : <label className="grid gap-1">Amount off (USD)<input required name="amountOff" value={values.amountOff} onChange={e => setValues(v => ({...v,amountOff:e.target.value}))} inputMode="decimal" pattern="(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?" className="border p-2" /></label>}
    <label className="grid gap-1">Redemption starts (Eastern)<input required type="datetime-local" name="startsAt" value={values.startsAt} onChange={e => setValues(v => ({...v, startsAt: e.target.value}))} className="min-w-0 border p-2 text-sm sm:text-base" /></label>
    <label className="grid gap-1">Redemption ends (Eastern, exclusive)<input required type="datetime-local" name="endsAt" value={values.endsAt} onChange={e => setValues(v => ({...v, endsAt: e.target.value}))} className="min-w-0 border p-2 text-sm sm:text-base" /></label>
    <fieldset className="min-w-0"><legend>Eligible products — select at least one</legend>{products.map(p => <label className="block break-words" key={p.id}><input type="checkbox" name="productIds" value={p.id} checked={values.productIds.includes(p.id)} onChange={e => setValues(v => ({...v, productIds: e.target.checked ? [...v.productIds, p.id] : v.productIds.filter(id => id !== p.id)}))} /> {p.name}</label>)}</fieldset>
    <button disabled={pending} className="bg-rhyze-black p-3 text-white">{pending ? 'Creating…' : 'Create disabled code'}</button>
  </form>;
}
