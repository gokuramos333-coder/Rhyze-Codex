import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { renderTransactionalEmail } from '@/lib/notifications/email-content';
import { EMAIL_TEMPLATE_REVISION } from '@/lib/notifications/email-templates';
import { site } from '@/lib/site';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(''),
  subject: z.enum(['general', 'membership', 'private-event', 'press']),
  message: z.string().min(5),
});

async function sendArchivedEmail(input: {
  resend: Resend;
  from: string;
  to: string;
  replyTo: string[];
  subject: string;
  template: 'CONTACT_FORM' | 'CONTACT_CONFIRMATION';
  payload: Record<string, unknown>;
  copyOverride?: unknown;
}) {
  const content = renderTransactionalEmail(input);
  const archive = await prisma.emailMessage.create({
    data: {
      direction: 'OUTBOUND',
      from: input.from,
      to: input.to,
      toList: [input.to],
      replyTo: input.replyTo,
      subject: content.subject,
      template: input.template,
      payload: input.payload as Prisma.InputJsonValue,
      textBody: content.text,
      htmlBody: content.html,
      status: 'PROCESSING',
      attempts: 1,
    },
  });

  const result = await input.resend.emails.send({
    from: input.from,
    to: [input.to],
    replyTo: input.replyTo,
    subject: content.subject,
    text: content.text,
    html: content.html,
    tags: [{ name: 'archive_id', value: archive.id }],
  });
  if (result.error) {
    await prisma.emailMessage.update({
      where: { id: archive.id },
      data: { status: 'FAILED', lastError: result.error.message },
    });
    return { ok: false as const, error: result.error.message };
  }
  await prisma.emailMessage.update({
    where: { id: archive.id },
    data: { status: 'SENT', sentAt: new Date(), providerId: result.data?.id, lastError: null },
  });
  return { ok: true as const, id: result.data?.id };
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = site.emails.melissa;
  const from = process.env.EMAIL_FROM || process.env.CONTACT_FROM_EMAIL;

  if (!apiKey || !from) {
    return NextResponse.json(
      {
        ok: false,
        error: 'contact_not_configured',
        message: `Online contact delivery is not connected yet. Please email ${site.emails.melissa} or call ${site.phone}.`,
      },
      { status: 503 },
    );
  }

  const approvedTemplates = await prisma.emailTemplateReview.findMany({
    where: {
      revision: EMAIL_TEMPLATE_REVISION,
      template: { in: ['CONTACT_FORM', 'CONTACT_CONFIRMATION'] },
    },
  });
  if (approvedTemplates.length !== 2) {
    return NextResponse.json(
      {
        ok: false,
        error: 'email_templates_pending_approval',
        message: `Online contact delivery is being finalized. Please email ${site.emails.melissa} or call ${site.phone}.`,
      },
      { status: 503 },
    );
  }

  try {
    const data = schema.parse(await req.json());
    const resend = new Resend(apiKey);
    const copyByTemplate = new Map(approvedTemplates.map((review) => [review.template, review.copyOverride]));
    const management = await sendArchivedEmail({
      resend,
      from,
      to,
      replyTo: [data.email],
      subject: `Website message from ${data.name}`,
      template: 'CONTACT_FORM',
      payload: {
        senderName: data.name,
        senderEmail: data.email,
        senderPhone: data.phone,
        inquiryType: data.subject,
        body: data.message,
        adminUrl: '/admin/messages',
      },
      copyOverride: copyByTemplate.get('CONTACT_FORM'),
    });
    if (!management.ok) {
      return NextResponse.json(
        { ok: false, error: 'delivery_failed', message: `We could not deliver this message. Please email ${site.emails.melissa} or call ${site.phone}.` },
        { status: 502 },
      );
    }

    const confirmation = await sendArchivedEmail({
      resend,
      from,
      to: data.email,
      replyTo: [site.emails.melissa],
      subject: 'We received your message',
      template: 'CONTACT_CONFIRMATION',
      payload: { name: data.name, contactUrl: '/contact' },
      copyOverride: copyByTemplate.get('CONTACT_CONFIRMATION'),
    });
    return NextResponse.json({ ok: true, id: management.id, confirmation: confirmation.ok });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'invalid', message: 'Please check each required field and try again.' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: 'delivery_failed', message: `We could not deliver this message. Please email ${site.emails.melissa} or call ${site.phone}.` },
      { status: 502 },
    );
  }
}
