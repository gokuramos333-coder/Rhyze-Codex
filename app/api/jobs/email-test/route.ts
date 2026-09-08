import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { renderTransactionalEmail } from '@/lib/notifications/email-content';
import { sampleEmailInput } from '@/lib/notifications/email-templates';

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.JOB_SECRET || authorization !== `Bearer ${process.env.JOB_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid recipient email is required.' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return NextResponse.json({ error: 'Transactional email is not configured.' }, { status: 503 });
  }

  const owner = await prisma.user.findFirst({
    where: { role: { in: ['OWNER', 'ADMIN'] } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!owner) return NextResponse.json({ error: 'No owner/admin user found.' }, { status: 500 });

  const template = 'ACCOUNT_ACTIVATION' as const;
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
  await prisma.emailMessage.update({
    where: { id: archive.id },
    data: { threadId: archive.id },
  });

  const result = await new Resend(apiKey).emails.send({
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
    return NextResponse.json({ error: result.error.message }, { status: 502 });
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

  return NextResponse.json({ sent: true, to: parsed.data.email, archiveId: archive.id });
}
