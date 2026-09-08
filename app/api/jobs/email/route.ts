import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/db/prisma';
import { renderTransactionalEmail } from '@/lib/notifications/email-content';
import { replyAddressForEmail } from '@/lib/notifications/email-archive';
import {
  emailDeliveryEnabled,
  emailDeliveryResumeAt,
} from '@/lib/notifications/email-delivery-config';
import { EMAIL_TEMPLATE_REVISION, isEmailTemplateKey } from '@/lib/notifications/email-templates';
import { classReminderIsDeliverable } from '@/lib/notifications/class-reminder-delivery';

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.JOB_SECRET || authorization !== `Bearer ${process.env.JOB_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!emailDeliveryEnabled()) {
    return NextResponse.json({ queued: 0, delivered: 0, failed: 0, paused: true });
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return NextResponse.json(
      { error: 'Transactional email is not configured. Set RESEND_API_KEY and EMAIL_FROM.' },
      { status: 503 },
    );
  }

  const resumeAt = emailDeliveryResumeAt();
  const due = await prisma.emailMessage.findMany({
    where: {
      status: 'QUEUED',
      scheduledFor: { lte: new Date() },
      ...(resumeAt ? { createdAt: { gte: resumeAt } } : {}),
    },
    orderBy: { scheduledFor: 'asc' },
    take: 50,
    include: { attachments: true },
  });
  const reviewedTemplates = await prisma.emailTemplateReview.findMany({
    where: {
      revision: EMAIL_TEMPLATE_REVISION,
      template: { in: [...new Set(due.map((message) => message.template))] },
    },
    select: { template: true, copyOverride: true },
  });
  const approvedTemplates = new Set(reviewedTemplates.map((review) => review.template));
  const reviewByTemplate = new Map(reviewedTemplates.map((review) => [review.template, review]));
  const deliverable = due.filter((message) =>
    isEmailTemplateKey(message.template) && approvedTemplates.has(message.template),
  );
  const resend = new Resend(apiKey);
  let delivered = 0;
  let failed = 0;
  let cancelled = 0;
  for (const message of deliverable) {
    const claimed = await prisma.emailMessage.updateMany({
      where: { id: message.id, status: 'QUEUED' },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      const stillDeliverable = await classReminderIsDeliverable(
        message,
        async (reference) => Boolean(await prisma.booking.findFirst({
          where: {
            ...(reference.bookingId ? { id: reference.bookingId } : {}),
            ...(reference.occurrenceId
              ? { occurrenceId: reference.occurrenceId }
              : {}),
            userId: reference.userId,
            status: 'CONFIRMED',
            occurrence: {
              status: 'SCHEDULED',
              ...(reference.classStartsAt
                ? { startAt: reference.classStartsAt }
                : {}),
              ...(reference.className
                ? { template: { name: reference.className } }
                : {}),
            },
          },
          select: { id: true },
        })),
      );
      if (!stillDeliverable) {
        await prisma.emailMessage.updateMany({
          where: { id: message.id, status: 'PROCESSING' },
          data: { status: 'CANCELLED', lastError: null },
        });
        cancelled += 1;
        continue;
      }
      const review = reviewByTemplate.get(message.template);
      const content = renderTransactionalEmail({
        subject: message.subject,
        template: message.template,
        payload: message.payload as Record<string, unknown>,
        copyOverride: review ? review.copyOverride : undefined,
      });
      const archiveReplyTo = replyAddressForEmail(
        message.id,
        process.env.RESEND_INBOUND_DOMAIN || '',
      );
      const managementReplyTo = process.env.EMAIL_REPLY_TO?.trim();
      const replyTo = [...new Set([
        ...message.replyTo,
        ...(archiveReplyTo ? [archiveReplyTo] : []),
        ...(managementReplyTo ? [managementReplyTo] : []),
      ])];
      await prisma.emailMessage.update({
        where: { id: message.id },
        data: {
          from,
          subject: content.subject,
          toList: message.toList.length ? message.toList : [message.to],
          replyTo,
          textBody: content.text,
          htmlBody: content.html,
          threadId: message.threadId || message.id,
        },
      });
      const result = await resend.emails.send({
        from,
        to: message.toList.length ? message.toList : [message.to],
        cc: message.cc.length ? message.cc : undefined,
        bcc: message.bcc.length ? message.bcc : undefined,
        replyTo: replyTo.length ? replyTo : undefined,
        subject: content.subject,
        attachments: message.attachments.map((attachment) => ({
          filename: attachment.filename,
          contentType: attachment.contentType,
          contentId: attachment.contentId || undefined,
          content: Buffer.from(attachment.content),
        })),
        tags: [{ name: 'archive_id', value: message.id }],
        text: content.text,
        html: content.html,
      });
      if (result.error) throw new Error(result.error.message);
      await prisma.emailMessage.update({
        where: { id: message.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          providerId: result.data?.id,
          lastError: null,
        },
      });
      delivered += 1;
    } catch (error) {
      await prisma.emailMessage.update({
        where: { id: message.id },
        data: {
          status: 'FAILED',
          lastError: error instanceof Error ? error.message : 'Unknown delivery error',
        },
      });
      failed += 1;
    }
  }
  return NextResponse.json({
    queued: due.length,
    pendingApproval: due.length - deliverable.length,
    delivered,
    failed,
    cancelled,
  });
}
