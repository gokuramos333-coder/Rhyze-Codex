import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'merchandise_studio_only',
      message:
        'Merchandise checkout is coming soon. Please view available options at the studio.',
    },
    { status: 409 },
  );
}
