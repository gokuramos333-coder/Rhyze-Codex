import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/db/prisma';
import { processResendWebhook } from '@/lib/notifications/resend-webhook';

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_RECEIVING_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    return NextResponse.json({ error: 'Resend receiving webhook is not configured.' }, { status: 503 });
  }

  const eventId = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!eventId || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing webhook signature headers.' }, { status: 400 });
  }

  const payload = await request.text();
  const resend = new Resend(apiKey);
  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id: eventId, timestamp, signature },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  try {
    const result = await processResendWebhook({ eventId, event, prisma, resend });
    return NextResponse.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    console.error('Resend webhook processing failed', error);
    return NextResponse.json(
      { error: 'Webhook processing failed and may be retried.' },
      { status: 500 },
    );
  }
}
