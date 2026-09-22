import type { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import { renderTransactionalEmail } from '@/lib/notifications/email-content';
import { EMAIL_TEMPLATE_REVISION } from '@/lib/notifications/email-templates';
import {
  emailDeliveryEnabled,
  emailDeliveryResumeAt,
} from '@/lib/notifications/email-delivery-config';

export const CALLBACK_EMAIL_PREFIX = 'callback-request:';
const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
type Submission = {
  from: string;
  to: string[];
  replyTo: string[];
  subject: string;
  text: string;
  html: string;
  tags: Array<{ name: string; value: string }>;
};
type DeliveryOptions = {
  enabled: boolean;
  from?: string;
  send?: (
    message: Submission,
    options: { idempotencyKey: string },
  ) => Promise<{
    data: { id: string } | null;
    error: { message: string } | null;
  }>;
  now?: Date;
  resumeAt?: Date | null;
};

function deliveryOptions(): DeliveryOptions {
  const key = process.env.RESEND_API_KEY;
  return {
    enabled: emailDeliveryEnabled(),
    from: process.env.EMAIL_FROM,
    resumeAt: emailDeliveryResumeAt(),
    send: key
      ? (message, options) => new Resend(key).emails.send(message, options)
      : undefined,
  };
}

export function callbackStaleLease(now: Date) {
  return {
    status: 'PROCESSING' as const,
    dedupeKey: { startsWith: CALLBACK_EMAIL_PREFIX },
    updatedAt: { lte: new Date(now.getTime() - LEASE_MS) },
  };
}

/** Used both by the request (immediate) and the existing email job (recovery).
 * A stable provider key prevents a process crash after send from sending twice.
 */
export async function deliverCallbackEmail(
  db: PrismaClient,
  id: string,
  options = deliveryOptions(),
): Promise<'sent' | 'pending' | 'failed'> {
  const now = options.now || new Date();
  const message = await db.emailMessage.findUnique({ where: { id } });
  if (
    !message ||
    !message.dedupeKey?.startsWith(CALLBACK_EMAIL_PREFIX) ||
    message.template !== 'CONTACT_FORM'
  )
    return 'failed';
  if (message.status === 'SENT') return 'sent';
  if (message.status === 'FAILED' || message.status === 'CANCELLED')
    return 'failed';
  if (
    !options.enabled ||
    !options.from ||
    !options.send ||
    (options.resumeAt && message.createdAt < options.resumeAt)
  )
    return 'pending';
  const review = await db.emailTemplateReview.findFirst({
    where: { template: 'CONTACT_FORM', revision: EMAIL_TEMPLATE_REVISION },
  });
  if (!review) return 'pending';
  const eligible = {
    id,
    attempts: message.attempts,
    OR: [
      { status: 'QUEUED' as const, scheduledFor: { lte: now } },
      callbackStaleLease(now),
    ],
  };
  // Resend retains idempotency keys for 24 hours. Stop before that window ends
  // if a prior attempt may have succeeded; retain the archive for staff review.
  const reservation = await db.callbackRequest.findUnique({
    where: { emailMessageId: id },
    select: { createdAt: true },
  });
  if (!reservation) return 'failed';
  if (
    message.attempts >= MAX_ATTEMPTS ||
    (message.attempts > 0 &&
      now.getTime() - reservation.createdAt.getTime() >= 23 * 3_600_000)
  ) {
    const stopped = await db.emailMessage.updateMany({
      where: eligible,
      data: {
        status: 'FAILED',
        lastError:
          'Callback notification needs staff review; automatic retry limit reached.',
      },
    });
    return stopped.count ? 'failed' : 'pending';
  }
  const claimed = await db.emailMessage.updateMany({
    where: eligible,
    data: { status: 'PROCESSING', attempts: { increment: 1 }, updatedAt: now },
  });
  if (!claimed.count) return 'pending';
  const lease = {
    id,
    status: 'PROCESSING' as const,
    attempts: message.attempts + 1,
  };
  try {
    const content =
      message.textBody && message.htmlBody
        ? {
            subject: message.subject,
            text: message.textBody,
            html: message.htmlBody,
          }
        : renderTransactionalEmail({
            subject: message.subject,
            template: message.template,
            payload: message.payload as Record<string, unknown>,
            copyOverride: review.copyOverride,
          });
    const from = message.from || options.from;
    // Freeze the approved rendering before the first provider call. Retry
    // payloads must remain identical even if staff edit the template meanwhile.
    await db.emailMessage.updateMany({
      where: lease,
      data: {
        from,
        subject: content.subject,
        textBody: content.text,
        htmlBody: content.html,
        threadId: message.threadId || id,
      },
    });
    const result = await options.send(
      {
        from,
        to: [message.to],
        replyTo: message.replyTo,
        ...content,
        tags: [{ name: 'archive_id', value: id }],
      },
      { idempotencyKey: `callback/${id}` },
    );
    if (result.error || !result.data?.id)
      throw new Error(
        result.error?.message || 'Provider did not confirm delivery.',
      );
    await db.emailMessage.updateMany({
      where: lease,
      data: {
        status: 'SENT',
        sentAt: now,
        providerId: result.data.id,
        lastError: null,
      },
    });
    return 'sent';
  } catch {
    const attempts = message.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await db.emailMessage.updateMany({
      where: lease,
      data: {
        status: exhausted ? 'FAILED' : 'QUEUED',
        scheduledFor: new Date(
          now.getTime() + Math.min(60, 2 ** (attempts - 1)) * 60_000,
        ),
        lastError: exhausted
          ? 'Callback email delivery failed; staff review required.'
          : 'Callback email delivery failed; retry scheduled.',
      },
    });
    return exhausted ? 'failed' : 'pending';
  }
}
