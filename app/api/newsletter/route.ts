import { NextResponse } from 'next/server';
import { z } from 'zod';
import { formatNewsletterEmail, sendRhyzeEmail } from '@/lib/email';

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = schema.parse(body);
    await sendRhyzeEmail(formatNewsletterEmail(email));

    return NextResponse.json({ ok: true });
  } catch (err) {
    const isInvalid = err instanceof z.ZodError;

    console.error('[newsletter] email failed:', err);

    return NextResponse.json(
      { ok: false, error: isInvalid ? 'invalid' : 'email' },
      { status: isInvalid ? 400 : 500 },
    );
  }
}
