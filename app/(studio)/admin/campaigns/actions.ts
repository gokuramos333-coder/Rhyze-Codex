'use server';

import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export async function createCampaignAction(formData: FormData) {
  const user = await requireArea('admin');
  const name = String(formData.get('name') || '').trim();
  const subject = String(formData.get('subject') || '').trim();
  const body = String(formData.get('body') || '').trim();
  const segment = String(formData.get('segment') || 'ALL_OPTED_IN');
  if (!name || !subject || !body) return;
  await prisma.emailCampaign.create({ data: { createdById: user.id, name, subject, body, segment } });
  revalidatePath('/admin/campaigns');
}

export async function queueCampaignAction(formData: FormData) {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign || campaign.status !== 'DRAFT') return;
  const recipients = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      notificationPreference: { marketingEmail: true },
      ...(campaign.segment === 'MEMBERS' ? { role: 'MEMBER' } : {}),
    },
    select: { id: true, email: true },
  });
  await prisma.$transaction([
    ...recipients.map((recipient) => prisma.emailMessage.create({
      data: { userId: recipient.id, to: recipient.email, subject: campaign.subject, template: 'CAMPAIGN', payload: { body: campaign.body, campaignId: campaign.id } },
    })),
    prisma.emailCampaign.update({ where: { id }, data: { status: 'SCHEDULED', scheduledFor: new Date(), recipientCount: recipients.length } }),
  ]);
  revalidatePath('/admin/campaigns');
}
