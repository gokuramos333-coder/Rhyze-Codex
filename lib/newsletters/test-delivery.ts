import { Resend } from 'resend';
import { prisma } from '@/lib/db/prisma';
import { campaignReview } from './campaigns';
import { renderNewsletter } from './render';
import { audit, captureEnabled, json, origin } from './repository';
import { normalizeEmail } from './domain';

/** Explicit, allowlisted tests share the existing provider and immutable email archive.
 * An uncertain response is held for provider reconciliation, never blindly retried.
 */
export async function sendNewsletterTest(
  actor: { id: string; name: string | null },
  input: { id: string; recipient: string; operationKey: string },
) {
  const capture = captureEnabled();
  const recipient = normalizeEmail(input.recipient);
  const allowed = (process.env.NEWSLETTER_TEST_RECIPIENTS || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);
  if (
    !capture &&
    (process.env.NEWSLETTER_TEST_SEND_ENABLED !== 'true' ||
      process.env.EMAIL_DELIVERY_ENABLED !== 'true' ||
      !process.env.RESEND_API_KEY ||
      !process.env.EMAIL_FROM ||
      !allowed.includes(recipient))
  )
    throw Error(
      'Test sending requires a configured provider, enabled test delivery, and an approved test recipient. No email was sent.',
    );
  const review = await campaignReview(input.id);
  const rendered = renderNewsletter({
    ...review.snapshot,
    origin: origin(),
    unsubscribeUrl: origin() + '/newsletter/unsubscribe/preview',
    firstName: actor.name?.split(' ')[0],
  });
  const archive = await prisma.emailMessage.upsert({
    where: { dedupeKey: 'newsletter-test:' + input.operationKey },
    update: {},
    create: {
      userId: actor.id,
      to: recipient,
      toList: [recipient],
      from: review.snapshot.sender,
      replyTo: [review.snapshot.replyTo],
      subject:
        (capture ? '[LOCAL TEST CAPTURE] ' : '[TEST] ') + rendered.subject,
      template: 'NEWSLETTER_TEST',
      payload: json({ campaignId: input.id, capture }),
      htmlBody: rendered.html,
      textBody: rendered.text,
      status: 'QUEUED',
      dedupeKey: 'newsletter-test:' + input.operationKey,
    },
  });
  if (
    archive.to !== recipient ||
    archive.userId !== actor.id ||
    (archive.payload as { campaignId?: string })?.campaignId !== input.id
  )
    throw Error('This test request belongs to another operation.');
  const claim = await prisma.emailMessage.updateMany({
    where: { id: archive.id, status: 'QUEUED' },
    data: { status: 'PROCESSING', attempts: { increment: 1 } },
  });
  if (!claim.count) {
    if (archive.status === 'SENT')
      return {
        archiveId: archive.id,
        status: capture ? 'CAPTURED' : 'ACCEPTED',
      };
    throw Error(
      'This test is already processing or has an uncertain provider result. Inspect the email archive before another attempt.',
    );
  }
  await audit(actor.id, 'TEST_REQUESTED', input.id, {
    archiveId: archive.id,
    capture,
  });
  if (capture) {
    await prisma.emailMessage.update({
      where: { id: archive.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        headers: json({ localCapture: true, notDelivered: true }),
      },
    });
    return { archiveId: archive.id, status: 'CAPTURED' };
  }
  try {
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
      {
        from: archive.from!,
        to: [archive.to],
        replyTo: archive.replyTo,
        subject: archive.subject,
        html: archive.htmlBody!,
        text: archive.textBody!,
      },
      { idempotencyKey: 'newsletter-test/' + input.operationKey },
    );
    if (result.error || !result.data?.id)
      throw Error('Provider acceptance not confirmed');
    await prisma.emailMessage.update({
      where: { id: archive.id },
      data: { status: 'SENT', providerId: result.data.id, sentAt: new Date() },
    });
    await audit(actor.id, 'TEST_ACCEPTED', input.id, { archiveId: archive.id });
    return { archiveId: archive.id, status: 'ACCEPTED' };
  } catch {
    await prisma.emailMessage.update({
      where: { id: archive.id },
      data: {
        status: 'FAILED',
        lastError:
          'Test acceptance uncertain. Check the provider before retrying.',
      },
    });
    throw Error(
      'Provider acceptance is unconfirmed. No automatic retry; inspect the email archive and provider.',
    );
  }
}
