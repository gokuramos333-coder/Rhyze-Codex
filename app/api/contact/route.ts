import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { site } from '@/lib/site';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(''),
  subject: z.enum(['general', 'membership', 'private-event', 'press']),
  message: z.string().min(5),
});

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  const from = process.env.CONTACT_FROM_EMAIL;

  if (!apiKey || !to || !from) {
    return NextResponse.json(
      {
        ok: false,
        error: 'contact_not_configured',
        message: `Online contact delivery is not connected yet. Please email ${site.emails.vanessa} or call ${site.phone}.`,
      },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const data = schema.parse(body);
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: [to],
      replyTo: data.email,
      subject: `Rhyze website inquiry: ${data.subject}`,
      text: [
        `Name: ${data.name}`,
        `Email: ${data.email}`,
        `Phone: ${data.phone || 'Not provided'}`,
        `Subject: ${data.subject}`,
        '',
        data.message,
      ].join('\n'),
    });

    if (result.error) {
      return NextResponse.json(
        {
          ok: false,
          error: 'delivery_failed',
          message: `We could not deliver this message. Please email ${site.emails.vanessa} or call ${site.phone}.`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, id: result.data?.id });
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'delivery_failed',
          message: `We could not deliver this message. Please email ${site.emails.vanessa} or call ${site.phone}.`,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid',
        message: 'Please check each required field and try again.',
      },
      { status: 400 },
    );
  }
}
