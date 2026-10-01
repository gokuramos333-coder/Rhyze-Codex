import { unsubscribe } from '@/lib/newsletters/delivery';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[a-f0-9-]{36}$/.test(token))
    return new Response(
      'This is a preview link; real emails include a working unsubscribe link.',
      { status: 400 },
    );
  return new Response(
    '<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>RHYZE FITNESS email preferences</title><body style="font:18px Arial;max-width:520px;margin:60px auto;padding:24px"><h1>Email preferences</h1><p>Stop Rhyze marketing emails. Your account, membership and essential booking messages stay unchanged.</p><form method="post"><button style="padding:16px">Unsubscribe from marketing emails</button></form></body></html>',
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
}
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    await unsubscribe(token);
    return new Response(
      'You are unsubscribed from Rhyze marketing emails. Your account and essential booking messages are unchanged.',
      {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch {
    return new Response(
      'Invalid unsubscribe link. Please contact Rhyze for help.',
      { status: 400 },
    );
  }
}
