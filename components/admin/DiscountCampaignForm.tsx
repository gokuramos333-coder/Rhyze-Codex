'use client';
import { saleWindowEnd } from '@/lib/domain/discounts/sale-window';
import { startTransition, useActionState, useState } from 'react';
export type DiscountAction = (data: FormData) => Promise<void | {error:string}>;
export function DiscountCampaignForm({ products, action }: { products: { id: string; name: string; billingInterval?: string }[]; action: DiscountAction }) {
  // Dispatch explicitly: React's form action reset also runs on returned validation errors.
  const empty = { code: '', discountKind: 'PERCENT', percentOff: '', amountOff: '', startsAt: '', endsAt: '', noEnd: false, duration: 'once', durationMonths: '', productIds: [] as string[] };
  const [values, setValues] = useState(empty);
  const [windowCount,setWindowCount]=useState('2');
  const [windowUnit,setWindowUnit]=useState('days');
  const [windowError,setWindowError]=useState('');
  const [result, submit, pending] = useActionState(async (_previous: {error:string}|null, data:FormData) => {
    const response = await action(data);
    if (!response?.error) setValues(empty);
    return response || null;
  }, null);
  return <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(() => submit(data)); }} className="grid min-w-0 gap-4 rounded border bg-white p-5">
    {result?.error && <p role="alert" className="border border-red-500 p-3">{result.error}</p>}
    <h2 className="text-2xl font-bold">Create discount code</h2>
    <p role="note">Codes start disabled. Review the dates, discount and eligible products, then enable the code when you are ready to share it.</p>
    <p>Choose when the sale is available, then choose how long the customer keeps the discount. Ending or disabling a sale does not remove an existing member’s discount. Percentage discounts follow the plan price; a lifetime discount does not lock an absolute dollar price.</p>
    <p>No stacking. Instructor referrals remain separate. One use per customer per sale. A different sale can be used later. Refunded redemptions remain used pending a separate policy decision.</p>
    <p>Redemption times are America/New_York. New checkouts stop at the exact advertised end. Checkouts authorized before closing can finish until 30 minutes after the sale closes, or their original session expiry if earlier (sessions last at most 24 hours). Finish means completing Checkout, not bank settlement or webhook arrival. Disabling does not revoke existing valid sessions; it stops new admissions. Legitimate completed payments can settle later.</p>
    <p>Fixed amounts are in USD; commercial discounts cannot make memberships or packages free. Birthday class/event gifts are separate. Terms cannot be edited after creation; create a new disabled code instead.</p>
    <label className="grid gap-1">Code<input required name="code" value={values.code} onChange={e => setValues(v => ({...v, code: e.target.value}))} minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" className="min-w-0 border p-2" /></label>
    <label className="grid gap-1">Discount type<select name="discountKind" value={values.discountKind} onChange={e => setValues(v => ({...v,discountKind:e.target.value}))} className="border p-2"><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount (USD)</option></select></label>
    {values.discountKind === 'PERCENT' ? <label className="grid gap-1">Percent off<input required name="percentOff" value={values.percentOff} onChange={e => setValues(v => ({...v, percentOff: e.target.value}))} type="number" min={1} max={99} step={1} className="border p-2" /></label> : <label className="grid gap-1">Amount off (USD)<input required name="amountOff" value={values.amountOff} onChange={e => setValues(v => ({...v,amountOff:e.target.value}))} inputMode="decimal" pattern="(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?" className="border p-2" /></label>}
    <h3 className="text-xl font-bold">1. Sale availability</h3>
    <label className="grid gap-1">Redemption starts (Eastern)<input required type="datetime-local" name="startsAt" value={values.startsAt} onChange={e => setValues(v => ({...v, startsAt: e.target.value}))} className="min-w-0 border p-2 text-sm sm:text-base" /></label>
    <div className="flex min-w-0 flex-wrap items-end gap-2"><label className="grid gap-1">Sale length<input aria-label="Sale length" type="number" min={1} max={600} value={windowCount} onChange={e=>setWindowCount(e.target.value)} className="w-24 border p-2" /></label><label className="grid gap-1">Unit<select aria-label="Sale length unit" value={windowUnit} onChange={e=>setWindowUnit(e.target.value)} className="border p-2"><option value="hours">Hours</option><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option></select></label><button type="button" className="border p-2" onClick={()=>{const end=saleWindowEnd(values.startsAt,Number(windowCount),windowUnit);setWindowError(end?'':'Enter a start time and a whole sale length from 1 to 600.');if(end)setValues(v=>({...v,endsAt:end,noEnd:false}));}}>Set end date</button></div>
    {windowError && <p role="alert">{windowError}</p>}
    <p>Shortcuts use New Jersey calendar time. Review the exact end below before creating the code.</p>
    <label><input type="checkbox" name="noEnd" value="true" checked={values.noEnd} onChange={e=>setValues(v=>({...v,noEnd:e.target.checked}))}/> No end date — available until disabled</label>
    {!values.noEnd && <label className="grid gap-1">Redemption ends (Eastern, exclusive)<input required type="datetime-local" name="endsAt" value={values.endsAt} onChange={e => setValues(v => ({...v, endsAt: e.target.value}))} className="min-w-0 border p-2 text-sm sm:text-base" /></label>}
    <h3 className="text-xl font-bold">2. How long the customer keeps the discount</h3>
    <label className="grid gap-1">Membership discount lasts<select name="duration" value={values.duration} onChange={e=>setValues(v=>({...v,duration:e.target.value,durationMonths:'',productIds:e.target.value==='once'?v.productIds:v.productIds.filter(id=>products.find(p=>p.id===id)?.billingInterval==='MONTHLY')}))} className="border p-2"><option value="once">First payment only</option><option value="repeating">A set number of months</option><option value="forever">Lifetime while subscribed</option></select></label>
    {values.duration==='repeating' && <label className="grid gap-1">Number of months<input required name="durationMonths" type="number" min={1} max={600} step={1} value={values.durationMonths} onChange={e=>setValues(v=>({...v,durationMonths:e.target.value}))} className="border p-2" /></label>}
    <p>{values.duration==='forever'?'The discount continues on this subscription until it ends. Canceling and rejoining does not restore a used code.':values.duration==='repeating'?'Discount starts with the first payment and applies for the selected number of months. Then regular monthly pricing resumes.':'First payment only: renewals return to regular price. Class packs receive a single discount.'}</p>
    <fieldset className="min-w-0"><legend>Eligible products — select at least one</legend>{products.map(p => <label className="block break-words" key={p.id}><input type="checkbox" name="productIds" value={p.id} disabled={values.duration!=='once' && p.billingInterval!=='MONTHLY'} checked={values.productIds.includes(p.id)} onChange={e => setValues(v => ({...v, productIds: e.target.checked ? [...v.productIds, p.id] : v.productIds.filter(id => id !== p.id)}))} /> {p.name}{values.duration!=='once' && p.billingInterval!=='MONTHLY' ? ' — first payment only' : ''}</label>)}</fieldset>
    <button disabled={pending} className="bg-rhyze-black p-3 text-white">{pending ? 'Creating…' : 'Create disabled code'}</button>
  </form>;
}
