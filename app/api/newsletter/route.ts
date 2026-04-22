import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({ email: z.string().email() });

// TODO: Integrate Mailchimp or Klaviyo
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = schema.parse(body);
    console.info('[newsletter] subscribe:', email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'invalid' },
      { status: 400 },
    );
  }
}
