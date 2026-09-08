'use server';

import { Resend } from 'resend';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { issueAccountClaim } from '@/lib/domain/accounts/account-claim-service';
import { prismaAccountClaimRepository } from '@/lib/domain/accounts/prisma-account-claim-repository';
import { renderTransactionalEmail } from '@/lib/notifications/email-content';
import {
  copyOverrideSchema,
  replaceSampleValuesWithPlaceholders,
} from '@/lib/notifications/email-template-overrides';
import {
  EMAIL_TEMPLATE_REVISION,
  type EmailPayload,
  emailTemplateCatalog,
  isEmailTemplateKey,
  sampleEmailInput,
} from '@/lib/notifications/email-templates';

const testSendSchema = z.object({
  template: z.string().refine(isEmailTemplateKey),
  email: z.string().email(),
});

const accountActivationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const editCopySchema = copyOverrideSchema.required({
  subject: true,
  eyebrow: true,
  headline: true,
  paragraphs: true,
});

function destination(template: string, result: string, messageId?: string) {
  const archived = messageId ? `&messageId=${encodeURIComponent(messageId)}` : '';
  return `/admin/email-previews?template=${encodeURIComponent(template)}${archived}&${result}`;
}

export async function approveEmailTemplateAction(formData: FormData) {
  const owner = await requireApprovedOwner();
  const template = String(formData.get('template') || '');
  const messageId = String(formData.get('messageId') || '');
  if (!isEmailTemplateKey(template)) redirect('/admin/email-previews?error=template');

  await prisma.emailTemplateReview.upsert({
    where: { template },
    update: {
      revision: EMAIL_TEMPLATE_REVISION,
      approvedAt: new Date(),
      approvedById: owner.id,
      approvedByEmail: owner.email,
    },
    create: {
      template,
      revision: EMAIL_TEMPLATE_REVISION,
      approvedById: owner.id,
      approvedByEmail: owner.email,
    },
  });
  redirect(destination(template, 'approved=1'));
}

export async function saveEmailTemplateCopyAction(formData: FormData) {
  const owner = await requireApprovedOwner();
  const template = String(formData.get('template') || '');
  const messageId = String(formData.get('messageId') || '');
  if (!isEmailTemplateKey(template)) redirect('/admin/email-previews?error=template');
  const parsed = editCopySchema.safeParse({
    subject: formData.get('subject'),
    eyebrow: formData.get('eyebrow'),
    headline: formData.get('headline'),
    greeting: formData.get('greeting'),
    paragraphs: String(formData.get('paragraphs') || '')
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    calloutTitle: formData.get('calloutTitle'),
    calloutBody: formData.get('calloutBody'),
    ctaLabel: formData.get('ctaLabel'),
    closing: formData.get('closing'),
  });
  if (!parsed.success) redirect(destination(template, 'error=copy', messageId));
  const sample = sampleEmailInput(template);
  const archivedMessage = messageId
    ? await prisma.emailMessage.findUnique({
        where: { id: messageId },
        select: { payload: true },
      })
    : null;
  const placeholderPayload = archivedMessage?.payload && typeof archivedMessage.payload === 'object' && !Array.isArray(archivedMessage.payload)
    ? archivedMessage.payload as EmailPayload
    : sample.payload;
  const reusableCopy = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [
    key,
    Array.isArray(value)
      ? value.map((item) => replaceSampleValuesWithPlaceholders(item, placeholderPayload))
      : typeof value === 'string'
        ? replaceSampleValuesWithPlaceholders(value, placeholderPayload)
        : value,
  ]));

  await prisma.emailTemplateReview.upsert({
    where: { template },
    update: {
      revision: EMAIL_TEMPLATE_REVISION,
      copyOverride: reusableCopy,
      approvedAt: new Date(),
      approvedById: owner.id,
      approvedByEmail: owner.email,
    },
    create: {
      template,
      revision: EMAIL_TEMPLATE_REVISION,
      copyOverride: reusableCopy,
      approvedById: owner.id,
      approvedByEmail: owner.email,
    },
  });
  redirect(destination(template, 'saved=1', messageId));
}

export async function sendTestEmailAction(formData: FormData) {
  const owner = await requireApprovedOwner();
  const parsed = testSendSchema.safeParse({
    template: formData.get('template'),
    email: formData.get('email'),
  });
  const selected = String(formData.get('template') || 'WELCOME');
  if (!parsed.success) redirect(destination(selected, 'error=recipient'));

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) redirect(destination(parsed.data.template, 'error=configuration'));

  const template = parsed.data.template;
  const sample = sampleEmailInput(template);
  const review = await prisma.emailTemplateReview.findUnique({ where: { template } });
  const rendered = renderTransactionalEmail({ ...sample, copyOverride: review?.copyOverride });
  const subject = `[TEST] ${rendered.subject}`;
  const archive = await prisma.emailMessage.create({
    data: {
      userId: owner.id,
      direction: 'OUTBOUND',
      from,
      to: parsed.data.email,
      toList: [parsed.data.email],
      replyTo: ['melissa@rhyzefit.com'],
      subject,
      template: `TEST_${template}`,
      payload: { ...sample.payload, sourceTemplate: template, isTest: true },
      textBody: rendered.text,
      htmlBody: rendered.html,
      status: 'PROCESSING',
      attempts: 1,
    },
  });
  await prisma.emailMessage.update({ where: { id: archive.id }, data: { threadId: archive.id } });

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: [parsed.data.email],
    replyTo: ['melissa@rhyzefit.com'],
    subject,
    text: rendered.text,
    html: rendered.html,
    tags: [
      { name: 'archive_id', value: archive.id },
      { name: 'email_test', value: 'true' },
    ],
  });
  if (result.error) {
    await prisma.emailMessage.update({
      where: { id: archive.id },
      data: { status: 'FAILED', lastError: result.error.message },
    });
    redirect(destination(template, 'error=delivery'));
  }
  await prisma.emailMessage.update({
    where: { id: archive.id },
    data: { status: 'SENT', sentAt: new Date(), providerId: result.data?.id, lastError: null },
  });
  redirect(destination(template, `sent=1&to=${encodeURIComponent(parsed.data.email)}`));
}

export async function sendAccountActivationEmailAction(formData: FormData) {
  const owner = await requireApprovedOwner();
  const parsed = accountActivationSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) redirect(destination('ACCOUNT_ACTIVATION', 'error=recipient'));

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    redirect(destination('ACCOUNT_ACTIVATION', 'error=configuration'));
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, name: true, role: true, status: true, passwordHash: true },
  });
  if (!user || (user.passwordHash && user.role !== 'OWNER')) {
    redirect(destination('ACCOUNT_ACTIVATION', 'error=activation'));
  }

  let claim: Awaited<ReturnType<typeof issueAccountClaim>>;
  try {
    claim = await issueAccountClaim(user.id, prismaAccountClaimRepository);
  } catch {
    redirect(destination('ACCOUNT_ACTIVATION', 'error=activation'));
  }

  const template = 'ACCOUNT_ACTIVATION' as const;
  const payload = {
    name: user.name?.split(/\s+/)[0] || 'Rhyzer',
    activationUrl: `/claim-account/${encodeURIComponent(claim.rawToken)}`,
  };
  const review = await prisma.emailTemplateReview.findUnique({ where: { template } });
  const rendered = renderTransactionalEmail({
    template,
    subject: emailTemplateCatalog[template].subject(),
    payload,
    copyOverride: review?.copyOverride,
  });
  const archive = await prisma.emailMessage.create({
    data: {
      userId: user.id,
      direction: 'OUTBOUND',
      from,
      to: user.email,
      toList: [user.email],
      replyTo: ['melissa@rhyzefit.com'],
      subject: rendered.subject,
      template,
      payload,
      textBody: rendered.text,
      htmlBody: rendered.html,
      status: 'PROCESSING',
      attempts: 1,
      dedupeKey: `account-activation:${user.id}:${claim.expiresAt.toISOString()}`,
    },
  });
  await prisma.emailMessage.update({
    where: { id: archive.id },
    data: { threadId: archive.id },
  });

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: [user.email],
    replyTo: ['melissa@rhyzefit.com'],
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    tags: [
      { name: 'archive_id', value: archive.id },
      { name: 'account_activation', value: 'true' },
    ],
  });
  if (result.error) {
    await prisma.emailMessage.update({
      where: { id: archive.id },
      data: { status: 'FAILED', lastError: result.error.message },
    });
    redirect(destination(template, 'error=delivery'));
  }
  await prisma.emailMessage.update({
    where: { id: archive.id },
    data: {
      status: 'SENT',
      sentAt: new Date(),
      providerId: result.data?.id,
      lastError: null,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: owner.id,
      action: 'account.activation.sent',
      entityType: 'User',
      entityId: user.id,
      after: { recipient: user.email, expiresAt: claim.expiresAt.toISOString() },
    },
  });
  redirect(destination(template, `activationSent=1&to=${encodeURIComponent(user.email)}`));
}
