import type { Prisma, PrismaClient } from '@prisma/client';
import type { Resend, WebhookEventPayload } from 'resend';
import { inboundThreadReference, resendStatusForEvent } from '@/lib/notifications/email-archive';

type ResendClient = Pick<Resend, 'emails'>;

function bareEmail(value: string) {
  const bracketed = value.match(/<([^>]+)>/);
  return (bracketed?.[1] || value).trim().toLowerCase();
}

function eventEmailId(event: WebhookEventPayload) {
  return 'email_id' in event.data ? event.data.email_id : null;
}

async function archiveInboundEmail(input: {
  event: Extract<WebhookEventPayload, { type: 'email.received' }>;
  prisma: PrismaClient;
  resend: ResendClient;
}) {
  const { data, error } = await input.resend.emails.receiving.get(input.event.data.email_id, {
    html_format: 'cid',
  });
  if (error || !data) throw new Error(error?.message || 'Resend did not return the received email.');

  const referencedId = inboundThreadReference([...data.to, ...data.received_for]);
  const referenced = referencedId
    ? await input.prisma.emailMessage.findUnique({ where: { id: referencedId } })
    : null;
  const existingByMessageId = !referenced && data.headers?.['in-reply-to']
    ? await input.prisma.emailMessage.findFirst({
        where: { messageId: data.headers['in-reply-to'] },
        orderBy: { createdAt: 'desc' },
      })
    : null;
  const parent = referenced || existingByMessageId;
  const threadId = parent?.threadId || parent?.id || data.message_id || data.id;
  const sender = bareEmail(data.from);
  const user = await input.prisma.user.findUnique({ where: { email: sender }, select: { id: true } });

  const archived = await input.prisma.emailMessage.upsert({
    where: { providerId: data.id },
    update: {
      from: data.from,
      to: data.to[0] || data.received_for[0] || '',
      toList: data.to,
      cc: data.cc || [],
      bcc: data.bcc || [],
      replyTo: data.reply_to || [],
      subject: data.subject,
      textBody: data.text,
      htmlBody: data.html,
      headers: (data.headers || {}) as Prisma.InputJsonValue,
      messageId: data.message_id,
      threadId,
      status: 'RECEIVED',
      receivedAt: new Date(data.created_at),
      lastError: null,
    },
    create: {
      userId: user?.id,
      direction: 'INBOUND',
      from: data.from,
      to: data.to[0] || data.received_for[0] || '',
      toList: data.to,
      cc: data.cc || [],
      bcc: data.bcc || [],
      replyTo: data.reply_to || [],
      subject: data.subject,
      template: 'INBOUND',
      payload: { source: 'RESEND_WEBHOOK' },
      textBody: data.text,
      htmlBody: data.html,
      headers: (data.headers || {}) as Prisma.InputJsonValue,
      messageId: data.message_id,
      threadId,
      status: 'RECEIVED',
      scheduledFor: new Date(data.created_at),
      receivedAt: new Date(data.created_at),
      providerId: data.id,
    },
  });

  for (const attachment of data.attachments) {
    const stored = await input.prisma.emailAttachment.findUnique({
      where: {
        emailMessageId_resendAttachmentId: {
          emailMessageId: archived.id,
          resendAttachmentId: attachment.id,
        },
      },
    });
    if (stored) continue;

    const response = await input.resend.emails.receiving.attachments.get({
      emailId: data.id,
      id: attachment.id,
    });
    if (response.error || !response.data) {
      throw new Error(response.error?.message || `Could not retrieve attachment ${attachment.id}.`);
    }
    const download = await fetch(response.data.download_url);
    if (!download.ok) throw new Error(`Attachment download failed with HTTP ${download.status}.`);
    const content = Buffer.from(await download.arrayBuffer());
    await input.prisma.emailAttachment.create({
      data: {
        emailMessageId: archived.id,
        resendAttachmentId: attachment.id,
        filename: response.data.filename || attachment.filename || 'attachment',
        contentType: response.data.content_type || attachment.content_type,
        contentDisposition: response.data.content_disposition || attachment.content_disposition,
        contentId: response.data.content_id || attachment.content_id,
        size: content.length,
        content,
      },
    });
  }
}

async function updateOutboundStatus(input: {
  event: WebhookEventPayload;
  prisma: PrismaClient;
  resend: ResendClient;
}) {
  const providerId = eventEmailId(input.event);
  const status = resendStatusForEvent(input.event.type);
  if (!providerId || !status || input.event.type === 'email.received') return;

  const update: Prisma.EmailMessageUpdateManyMutationInput = { status };
  if (input.event.type === 'email.failed') update.lastError = input.event.data.failed.reason;
  if (input.event.type === 'email.bounced') update.lastError = input.event.data.bounce.message;
  if (input.event.type === 'email.suppressed') update.lastError = input.event.data.suppressed.message;
  await input.prisma.emailMessage.updateMany({ where: { providerId }, data: update });

  if (input.event.type === 'email.sent' || input.event.type === 'email.delivered') {
    const archived = await input.resend.emails.get(providerId);
    if (archived.data) {
      await input.prisma.emailMessage.updateMany({
        where: { providerId },
        data: {
          messageId: archived.data.message_id,
          headers: { tags: archived.data.tags || [] },
        },
      });
    }
  }
}

export async function processResendWebhook(input: {
  eventId: string;
  event: WebhookEventPayload;
  prisma: PrismaClient;
  resend: ResendClient;
}) {
  const providerId = eventEmailId(input.event);
  await input.prisma.resendWebhookEvent.upsert({
    where: { id: input.eventId },
    update: {},
    create: {
      id: input.eventId,
      type: input.event.type,
      resendEmailId: providerId,
      payload: input.event as unknown as Prisma.InputJsonValue,
    },
  });
  const claimed = await input.prisma.resendWebhookEvent.updateMany({
    where: { id: input.eventId, processingAt: null, processedAt: null },
    data: { processingAt: new Date(), error: null },
  });
  if (!claimed.count) return { duplicate: true };

  try {
    if (input.event.type === 'email.received') {
      await archiveInboundEmail({ ...input, event: input.event });
    } else {
      await updateOutboundStatus(input);
    }
    await input.prisma.resendWebhookEvent.update({
      where: { id: input.eventId },
      data: { processingAt: null, processedAt: new Date(), error: null },
    });
    return { duplicate: false };
  } catch (error) {
    await input.prisma.resendWebhookEvent.update({
      where: { id: input.eventId },
      data: {
        processingAt: null,
        error: error instanceof Error ? error.message : 'Unknown Resend webhook error',
      },
    });
    throw error;
  }
}
