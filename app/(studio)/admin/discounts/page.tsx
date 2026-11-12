import Link from 'next/link';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { DiscountCampaignToggle } from '@/components/admin/DiscountCampaignToggle';
import { campaignProductEligible, campaignStatus, campaignValueLabel, campaignDurationLabel } from '@/lib/domain/discounts/campaign';
import { DiscountCampaignForm } from '@/components/admin/DiscountCampaignForm';
import { createDiscountCampaignAction, setDiscountCampaignEnabledAction } from './actions';
export const dynamic = 'force-dynamic';
export default async function DiscountsPage() {
  await requireApprovedOwner();
  const [products, campaigns] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.discountCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  const format = (date: Date) => date.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' });
  return <main className="mx-auto grid max-w-4xl gap-6 p-5">
    <Link href="/admin/payments">Back to Sales</Link><h1 className="text-3xl font-bold">Discounts</h1>
    <DiscountCampaignForm products={products.filter(campaignProductEligible)} action={createDiscountCampaignAction} />
    <h2 className="text-xl font-bold">Latest 100 codes — copy the code to share</h2>
    {campaigns.map(c => <section key={c.id} className="grid min-w-0 gap-2 border bg-white p-4">
      <h3 className="break-all text-xl font-bold">{c.code}</h3>
      <p>{campaignValueLabel(c)} off · {campaignDurationLabel(c)}. {campaignStatus(c)}</p>
      <p>{format(c.startsAt)} → {c.endsAt ? format(c.endsAt) : 'No end date'}. New checkouts stop at the advertised end; one use per customer per sale.</p>
      <p>Eligible: {c.productIds.map(id => products.find(p => p.id === id)?.name || `Inactive product (${id})`).join(', ')}</p>
      <p>Share this code for entry in the member membership checkout. No stacking or referral commission. Disabling does not revoke issued sessions; they can finish until 30 minutes after the sale closes, or their original session expiry if earlier (at most 24 hours). Finish means completing Checkout, not settlement or webhook arrival. Requests processed too late can fail without extending the deadline.</p>
      <DiscountCampaignToggle id={c.id} enabled={c.enabled} action={setDiscountCampaignEnabledAction} />
    </section>)}
  </main>;
}
