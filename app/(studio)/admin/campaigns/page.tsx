import { prisma } from '@/lib/db/prisma';
import { createCampaignAction, queueCampaignAction } from './actions';

export default async function CampaignsPage() {
  const campaigns = await prisma.emailCampaign.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Member communications</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">CAMPAIGNS</h1>
      <p className="mt-4 text-sm text-rhyze-black/55">Campaigns only queue members who opted into marketing. Delivery runs from the background email queue.</p>
      <form action={createCampaignAction} className="mt-8 grid gap-4 border-t-4 border-rhyze-gold bg-white p-6 md:grid-cols-2">
        <Field name="name" label="Internal campaign name" />
        <Field name="subject" label="Email subject" />
        <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">Recipient segment</span><select name="segment" className="min-h-12 border px-3"><option value="ALL_OPTED_IN">All opted-in users</option><option value="MEMBERS">Members</option></select></label>
        <label className="grid gap-2 md:col-span-2"><span className="text-xs font-black uppercase tracking-widest">Message</span><textarea name="body" required rows={7} className="border p-3"/></label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">Save draft</button>
      </form>
      <div className="mt-8 grid gap-3">
        {campaigns.map((campaign) => <article key={campaign.id} className="grid gap-3 bg-white p-5 md:grid-cols-[1fr_auto]"><span><strong className="block font-display text-3xl tracking-wider">{campaign.name}</strong><small>{campaign.subject} · {campaign.segment.replaceAll('_',' ')} · {campaign.status}</small></span>{campaign.status === 'DRAFT' && <form action={queueCampaignAction}><input type="hidden" name="id" value={campaign.id}/><button className="border border-rhyze-coral px-4 py-2 text-xs font-black uppercase text-rhyze-coral">Queue send</button></form>}</article>)}
      </div>
    </>
  );
}
function Field({ name, label }: { name: string; label: string }) { return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">{label}</span><input name={name} required className="min-h-12 border px-3"/></label>; }
