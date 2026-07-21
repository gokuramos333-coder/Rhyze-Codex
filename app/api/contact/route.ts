import { NextResponse } from 'next/server';
import { z } from 'zod';
import { formatContactEmail, sendRhyzeEmail } from '@/lib/email';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(''),
  subject: z.enum(['general', 'membership', 'private-event', 'press']),
  message: z.string().min(5),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = schema.parse(body);
    await sendRhyzeEmail(formatContactEmail(data));

    return NextResponse.json({ ok: true });
  } catch (err) {
    const isInvalid = err instanceof z.ZodError;

    console.error('[contact] email failed:', err);

    return NextResponse.json(
      { ok: false, error: isInvalid ? 'invalid' : 'email' },
      { status: isInvalid ? 400 : 500 },
    );
  }
}
