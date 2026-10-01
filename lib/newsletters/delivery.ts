import { Resend } from 'resend';
import { prisma } from '@/lib/db/prisma';
import {
  audit,
  captureEnabled,
  json,
  loadCustomers,
  origin,
} from './repository';
import { prepareCampaign } from './campaigns';
import {
  eligibility,
  type NewsletterDocument,
  type ScheduleItem,
} from './domain';
import { renderNewsletter } from './render';
export type FrozenNewsletter = {
  subject: string;
  previewText: string;
  document: NewsletterDocument;
  schedule: ScheduleItem[];
  sender: string;
  replyTo: string;
  postalAddress: string;
  targetWeek: string;
  origin: string;
};
export async function runNewsletterBatch() {
  const capture = captureEnabled();
  if (
    !capture &&
    (process.env.NEWSLETTER_DELIVERY_ENABLED !== 'true' ||
      process.env.EMAIL_DELIVERY_ENABLED !== 'true' ||
      !process.env.RESEND_API_KEY ||
      !process.env.EMAIL_FROM)
  )
    return { paused: true, accepted: 0, captured: 0 };
  const stale = new Date(Date.now() - 10 * 60000);
  await prisma.newsletterRecipient.updateMany({
    where: { status: 'DISPATCHING', leaseAt: { lt: stale } },
    data: {
      status: 'UNKNOWN',
      lastError:
        'Dispatch was interrupted. Verify provider outcome before any retry.',
    },
  });
  const due = await prisma.emailCampaign.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledFor: { lte: new Date() },
      segment: 'NEWSLETTER_V1',
    },
    take: 5,
    orderBy: { scheduledFor: 'asc' },
  });
  for (const c of due) {
    if (c.segment === 'NEWSLETTER_V1') await prepareCampaign(c.id);
  }
  const pending = await prisma.newsletterRecipient.findMany({
    where: {
      status: { in: ['QUEUED', 'RETRY'] },
      nextAttemptAt: { lte: new Date() },
      campaign: { status: 'SENDING' },
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
    include: { campaign: true },
  });
  let accepted = 0,
    captured = 0;
  for (const recipient of pending) {
    const claimed = await prisma.newsletterRecipient.updateMany({
      where: {
        id: recipient.id,
        status: { in: ['QUEUED', 'RETRY'] },
        campaign: { status: 'SENDING' },
      },
      data: {
        status: 'DISPATCHING',
        leaseAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) continue;
    const current = (await loadCustomers(30, true)).filter(
      (c) => c.email.trim().toLowerCase() === recipient.email,
    );
    const suppression = await prisma.marketingSuppression.findUnique({
      where: { email: recipient.email },
    });
    const reason =
      suppression?.reason ||
      (!current.length
        ? 'Recipient unavailable'
        : current.map((c) => eligibility(c)).find(Boolean));
    if (reason) {
      await prisma.newsletterRecipient.update({
        where: { id: recipient.id },
        data: { status: 'EXCLUDED', exclusionReason: reason },
      });
      continue;
    }
    const latest = await prisma.emailCampaign.findUniqueOrThrow({
      where: { id: recipient.campaignId },
    });
    if (latest.status !== 'SENDING') {
      await prisma.newsletterRecipient.update({
        where: { id: recipient.id },
        data: { status: 'CANCELLED' },
      });
      continue;
    }
    const snapshot = latest.sentSnapshot as unknown as FrozenNewsletter;
    const unsubscribeUrl = `${snapshot.origin}/newsletter/unsubscribe/${recipient.token}`;
    const rendered = renderNewsletter({
      ...snapshot,
      origin: snapshot.origin,
      unsubscribeUrl,
      firstName: recipient.firstName || undefined,
      campaignId: latest.id,
    });
    const archive = await prisma.emailMessage.upsert({
      where: { dedupeKey: `newsletter:${recipient.id}` },
      update: {},
      create: {
        userId: recipient.userId,
        to: recipient.email,
        toList: [recipient.email],
        from: snapshot.sender,
        replyTo: [snapshot.replyTo],
        subject: rendered.subject,
        template: 'NEWSLETTER_V1',
        payload: json({
          campaignId: latest.id,
          recipientId: recipient.id,
          capture,
        }),
        htmlBody: rendered.html,
        textBody: rendered.text,
        status: 'PROCESSING',
        dedupeKey: `newsletter:${recipient.id}`,
      },
    });
    await prisma.newsletterRecipient.update({
      where: { id: recipient.id },
      data: { emailMessageId: archive.id },
    });
    try {
      if (capture) {
        await prisma.$transaction([
          prisma.emailMessage.update({
            where: { id: archive.id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              headers: json({ localCapture: true, notDelivered: true }),
            },
          }),
          prisma.newsletterRecipient.update({
            where: { id: recipient.id },
            data: { status: 'CAPTURED', acceptedAt: null, leaseAt: null },
          }),
        ]);
        captured++;
        continue;
      }
      const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
        {
          from: snapshot.sender,
          to: [recipient.email],
          replyTo: snapshot.replyTo,
          subject: archive.subject,
          html: archive.htmlBody || rendered.html,
          text: archive.textBody || rendered.text,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
          tags: [
            { name: 'campaign_id', value: latest.id },
            { name: 'recipient_id', value: recipient.id },
          ],
        },
        { idempotencyKey: `newsletter/${recipient.id}` },
      );
      if (result.error) {
        const rateLimited = result.error.name === 'rate_limit_exceeded';
        const retry = rateLimited && recipient.attempts < 3;
        await prisma.newsletterRecipient.update({
          where: { id: recipient.id },
          data: {
            status: retry ? 'RETRY' : rateLimited ? 'FAILED' : 'UNKNOWN',
            nextAttemptAt: new Date(Date.now() + 5 * 60000),
            lastError: rateLimited
              ? 'Provider rate limit. Bounded retry scheduled.'
              : 'Provider did not confirm acceptance. Review provider status before retrying.',
            leaseAt: null,
          },
        });
        await prisma.emailMessage.update({
          where: { id: archive.id },
          data: {
            status: 'FAILED',
            lastError: 'Newsletter provider acceptance not confirmed.',
          },
        });
        continue;
      }
      if (!result.data?.id) throw Error('No provider ID');
      await prisma.$transaction([
        prisma.emailMessage.update({
          where: { id: archive.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            providerId: result.data.id,
            lastError: null,
          },
        }),
        prisma.newsletterRecipient.update({
          where: { id: recipient.id },
          data: {
            status: 'ACCEPTED',
            acceptedAt: new Date(),
            leaseAt: null,
            lastError: null,
          },
        }),
      ]);
      accepted++;
    } catch {
      await prisma.newsletterRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'UNKNOWN',
          leaseAt: null,
          lastError:
            'Provider acceptance uncertain. No automatic resend; reconcile first.',
        },
      });
    }
  }
  const active = await prisma.emailCampaign.findMany({
    where: { status: 'SENDING', segment: 'NEWSLETTER_V1' },
    include: { recipients: { select: { status: true } } },
  });
  for (const c of active) {
    if (
      c.recipients.some((r) =>
        ['QUEUED', 'RETRY', 'DISPATCHING'].includes(r.status),
      )
    )
      continue;
    const ok = c.recipients.some((r) =>
      ['ACCEPTED', 'CAPTURED'].includes(r.status),
    );
    const failed = c.recipients.some((r) =>
      ['UNKNOWN', 'FAILED'].includes(r.status),
    );
    const status = failed ? (ok ? 'PARTIALLY_SENT' : 'FAILED') : 'SENT';
    await prisma.emailCampaign.updateMany({
      where: { id: c.id, status: 'SENDING' },
      data: {
        status,
        sentAt: new Date(),
        holdReason: failed
          ? 'Some recipients require provider reconciliation. Accepted messages will not be resent.'
          : null,
      },
    });
    await audit(null, 'DISPATCH_FINISHED', c.id, { status, capture });
  }
  return { paused: false, accepted, captured };
}
export async function newsletterWebhook(
  eventId: string,
  event: { type: string; created_at?: string; data: Record<string, unknown> },
  client: typeof prisma = prisma,
) {
  const providerId =
    typeof event.data.email_id === 'string' ? event.data.email_id : null;
  if (!providerId) return;
  const recipient = await client.newsletterRecipient.findFirst({
    where: { emailMessage: { providerId } },
  });
  if (!recipient) return;
  const click = event.data.click as
    | { link?: string; timestamp?: string; userAgent?: string }
    | undefined;
  const bounce = event.data.bounce as
    | { type?: string; subType?: string; message?: string }
    | undefined;
  const happened = new Date(event.created_at || new Date());
  if (!Number.isFinite(happened.getTime())) throw Error('Invalid event date');
  await client.$transaction(async (tx) => {
    await tx.newsletterEvent.upsert({
      where: { id: eventId },
      update: {},
      create: {
        id: eventId,
        recipientId: recipient.id,
        type: event.type,
        occurredAt: happened,
        link: click?.link?.slice(0, 2000) || null,
        automated:
          typeof event.data.automated === 'boolean'
            ? event.data.automated
            : null,
        detail: bounce?.type || null,
      },
    });
    const hard =
      event.type === 'email.bounced' &&
      bounce?.type?.toLowerCase() === 'permanent';
    if (hard || ['email.complained', 'email.suppressed'].includes(event.type)) {
      const reason = hard
        ? 'Hard bounce'
        : event.type === 'email.complained'
          ? 'Spam complaint'
          : 'Provider suppression';
      await tx.marketingSuppression.upsert({
        where: { email: recipient.email },
        update: { reason, source: 'Resend webhook' },
        create: { email: recipient.email, reason, source: 'Resend webhook' },
      });
      await audit(null, 'SUPPRESSION', recipient.campaignId, { reason }, tx);
    }
  });
}
export async function unsubscribe(token: string) {
  const r = await prisma.newsletterRecipient.findUnique({ where: { token } });
  if (!r) throw Error('This unsubscribe link is invalid.');
  await prisma.$transaction(async (tx) => {
    await tx.marketingSuppression.upsert({
      where: { email: r.email },
      update: { reason: 'Unsubscribed', source: 'Recipient preference' },
      create: {
        email: r.email,
        reason: 'Unsubscribed',
        source: 'Recipient preference',
      },
    });
    if (r.userId)
      await tx.notificationPreference.upsert({
        where: { userId: r.userId },
        create: { userId: r.userId, marketingEmail: false },
        update: { marketingEmail: false },
      });
    await tx.newsletterEvent.upsert({
      where: { id: `unsubscribe:${r.id}` },
      update: {},
      create: {
        id: `unsubscribe:${r.id}`,
        recipientId: r.id,
        type: 'unsubscribe',
        occurredAt: new Date(),
      },
    });
    await audit(null, 'UNSUBSCRIBED', r.campaignId, { recipientId: r.id }, tx);
  });
}
