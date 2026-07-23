import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = schema.parse(body);
    await prisma.newsletterLead.upsert({
      where: { email: email.trim().toLowerCase() },
      update: { source: 'website-footer' },
      create: {
        email: email.trim().toLowerCase(),
        source: 'website-footer',
      },
    });
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
