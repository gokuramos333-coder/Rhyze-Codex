import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(''),
  subject: z.enum(['general', 'membership', 'private-event', 'press']),
  message: z.string().min(5),
});

// TODO: Hook up to SendGrid or Resend
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = schema.parse(body);
    console.info('[contact] submission:', data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid' },
      { status: 400 },
    );
  }
}
