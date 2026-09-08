import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { replyAddressForEmail } from '@/lib/notifications/email-archive';
import { renderTransactionalEmail } from '@/lib/notifications/email-content';
import { queueEmail } from '@/lib/notifications/email-queue';
import { EMAIL_TEMPLATE_REVISION } from '@/lib/notifications/email-templates';

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = schema.parse(body);
    const normalizedEmail = email.trim().toLowerCase();
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) throw new Error('Newsletter email delivery is not configured.');
    const review = await prisma.emailTemplateReview.findFirst({
      where: { template: 'NEWSLETTER_WELCOME', revision: EMAIL_TEMPLATE_REVISION },
    });
    if (!review) throw new Error('Newsletter welcome template is not approved.');
    const queued = await prisma.$transaction(async (tx) => {
      await tx.newsletterLead.upsert({
        where: { email: normalizedEmail },
        update: { source: 'website-footer' },
        create: {
          email: normalizedEmail,
          source: 'website-footer',
        },
      });
      return queueEmail(tx, {
        to: normalizedEmail,
        subject: 'You’re in the Rhyze rhythm',
        template: 'NEWSLETTER_WELCOME',
        payload: { email: normalizedEmail, classesUrl: '/classes' },
        dedupeKey: `newsletter-welcome:${normalizedEmail}`,
      });
    });
    if (queued.status !== 'SENT') {
      const claimed = await prisma.emailMessage.updateMany({
        where: { id: queued.id, status: { in: ['QUEUED', 'FAILED'] } },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      });
      if (!claimed.count) {
        return NextResponse.json({ ok: true, message: 'You are on the Rhyze updates list.' });
      }
      const content = renderTransactionalEmail({
        subject: queued.subject,
        template: 'NEWSLETTER_WELCOME',
        payload: queued.payload as Record<string, unknown>,
        copyOverride: review.copyOverride,
      });
      const archivedReply = replyAddressForEmail(queued.id, process.env.RESEND_INBOUND_DOMAIN || '');
      const managementReply = process.env.EMAIL_REPLY_TO?.trim();
      const replyTo = [...new Set([
        ...(archivedReply ? [archivedReply] : []),
        ...(managementReply ? [managementReply] : []),
      ])];
      await prisma.emailMessage.update({
        where: { id: queued.id },
        data: {
          from,
          toList: [normalizedEmail],
          replyTo,
          subject: content.subject,
          textBody: content.text,
          htmlBody: content.html,
          threadId: queued.threadId || queued.id,
        },
      });
      const result = await new Resend(apiKey).emails.send({
        from,
        to: [normalizedEmail],
        replyTo: replyTo.length ? replyTo : undefined,
        subject: content.subject,
        text: content.text,
        html: content.html,
        tags: [{ name: 'archive_id', value: queued.id }],
      });
      if (result.error) {
        await prisma.emailMessage.update({
          where: { id: queued.id },
          data: { status: 'FAILED', lastError: result.error.message },
        });
        throw new Error(result.error.message);
      }
      await prisma.emailMessage.update({
        where: { id: queued.id },
        data: { status: 'SENT', sentAt: new Date(), providerId: result.data?.id, lastError: null },
      });
    }
    return NextResponse.json({
      ok: true,
      message: 'You are on the Rhyze updates list.',
    });
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'storage_unavailable',
          message:
            'Newsletter signup is temporarily unavailable. Please try again later.',
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid',
        message: 'Enter a valid email address.',
      },
      { status: 400 },
    );
  }
}
