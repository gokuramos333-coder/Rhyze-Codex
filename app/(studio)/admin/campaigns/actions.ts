'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export async function createCampaignAction(formData: FormData) {
  const user = await requireArea('admin');
  const name = String(formData.get('name') || '').trim();
  const subject = String(formData.get('subject') || '').trim();
  const body = String(formData.get('body') || '').trim();
  const rawSegment = String(formData.get('segment') || 'ALL_OPTED_IN');
  const occurrenceId = String(formData.get('occurrenceId') || '');
  const segment = rawSegment === 'CLASS_ATTENDEES' ? `CLASS_ATTENDEES:${occurrenceId}` : rawSegment;
  const intent = String(formData.get('intent') || 'SAVE_DRAFT');
  if (!name || !subject || !body) return;
  if (rawSegment === 'CLASS_ATTENDEES' && !occurrenceId) redirect('/admin/campaigns?error=class-required');
  const campaign = await prisma.emailCampaign.create({ data: { createdById: user.id, name, subject, body, segment } });
  if (intent === 'SEND_NOW') {
    await queueCampaign(campaign.id, segment, subject, body);
  }
  revalidatePath('/admin/campaigns');
  redirect(`/admin/campaigns?sent=${intent === 'SEND_NOW' ? 'queued' : 'draft'}`);
}

export async function queueCampaignAction(formData: FormData) {
  await requireArea('admin');
  const id = String(formData.get('id') || '');
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign || campaign.status !== 'DRAFT') return;
  await queueCampaign(campaign.id, campaign.segment, campaign.subject, campaign.body);
  revalidatePath('/admin/campaigns');
}

async function queueCampaign(id: string, segment: string, subject: string, body: string) {
  const classOccurrenceId = segment.startsWith('CLASS_ATTENDEES:') ? segment.split(':')[1] : null;
  const recipients = classOccurrenceId
    ? (await prisma.booking.findMany({
        where: {
          occurrenceId: classOccurrenceId,
          status: { in: ['CONFIRMED', 'ATTENDED'] },
          user: { status: 'ACTIVE', notificationPreference: { transactionalEmail: true } },
        },
        select: { user: { select: { id: true, email: true } } },
      })).map((booking) => booking.user)
    : await prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          notificationPreference: { marketingEmail: true },
          ...(segment === 'MEMBERS' ? { role: 'MEMBER' as const } : {}),
        },
        select: { id: true, email: true },
      });
  const uniqueRecipients = [...new Map(recipients.map((recipient) => [recipient.id, recipient])).values()];
  await prisma.$transaction([
    ...uniqueRecipients.map((recipient) => prisma.emailMessage.create({
      data: { userId: recipient.id, to: recipient.email, subject, template: 'CAMPAIGN', payload: { body, campaignId: id } },
    })),
    prisma.emailCampaign.update({ where: { id }, data: { status: 'SCHEDULED', scheduledFor: new Date(), recipientCount: uniqueRecipients.length } }),
  ]);
}
