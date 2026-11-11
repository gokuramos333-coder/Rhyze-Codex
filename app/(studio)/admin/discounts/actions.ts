'use server';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { campaignProductEligible, campaignValueQuote, parseCampaignForm } from '@/lib/domain/discounts/campaign';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createDiscountCampaignAction(form: FormData) {
  const owner = await requireApprovedOwner();
  let terms;
  try { terms = parseCampaignForm(form); }
  catch (error) { return { error: error instanceof Error ? error.message : 'Check the campaign details.' }; }
  try {
    await prisma.$transaction(async tx => {
      const products = await tx.product.findMany({ where: { id: { in: terms.productIds }, isActive: true } });
      if (products.length !== terms.productIds.length || !products.every(campaignProductEligible)) throw Error('Select active monthly memberships or one-time class packs.');
      for (const product of products) campaignValueQuote(terms, product);
      const campaign = await tx.discountCampaign.create({ data: { ...terms, enabled: false } });
      await tx.auditLog.create({ data: { actorId: owner.id, action: 'DISCOUNT_CAMPAIGN_CREATED', entityType: 'DiscountCampaign', entityId: campaign.id, after: { ...terms, startsAt: terms.startsAt.toISOString(), endsAt: terms.endsAt.toISOString(), enabled: false } } });
    });
  } catch {
    return { error: 'Unable to create code. Choose an unused code and active eligible products, then retry. Your entries are retained.' };
  }
  revalidatePath('/admin/discounts');
  redirect('/admin/discounts?result=created');
}
export async function setDiscountCampaignEnabledAction(form: FormData) {
  const owner = await requireApprovedOwner();
  const id = String(form.get('id') || '');
  const value = form.get('enabled');
  if (!id || !['true','false'].includes(String(value))) return { error: 'Invalid campaign change. Refresh and try again.' };
  const enabled = value === 'true';
  try {
    await prisma.$transaction(async tx => {
      const before = await tx.discountCampaign.findUniqueOrThrow({ where: { id } });
      if (enabled && before.endsAt.getTime() <= Date.now()) throw Error('Campaign is expired or closing.');
      await tx.discountCampaign.update({ where: { id }, data: { enabled } });
      await tx.auditLog.create({ data: { actorId: owner.id, action: 'DISCOUNT_CAMPAIGN_ENABLED_CHANGED', entityType: 'DiscountCampaign', entityId: id, before: { enabled: before.enabled }, after: { enabled } } });
    });
  } catch {
    return { error: 'Unable to update code. Expired codes cannot be enabled. Refresh and try again.' };
  }
  revalidatePath('/admin/discounts');
  redirect('/admin/discounts?result=updated');
}
