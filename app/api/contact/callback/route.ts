import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { callbackInputSchema } from '@/lib/domain/contact/callback-input';
import {
  CallbackError,
  getCallbackAvailability,
  reserveCallback,
} from '@/lib/domain/contact/callback-service';
import { deliverCallbackEmail } from '@/lib/domain/contact/callback-email';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const unavailable = `The callback calendar is temporarily unavailable. Please call ${site.phone} or email ${site.emails.melissa}.`;
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers });

export async function GET() {
  try {
    return json(await getCallbackAvailability(prisma));
  } catch {
    return json({ error: 'unavailable', message: unavailable }, 503);
  }
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError('Empty body');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new RangeError('Body too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export async function POST(request: Request) {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  if (request.headers.get('origin') !== origin)
    return json(
      {
        error: 'forbidden',
        message: 'Please request your callback from our Contact page.',
      },
      403,
    );
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  )
    return json({ error: 'invalid_content_type' }, 415);
  try {
    const parsed = callbackInputSchema.safeParse(await readBody(request));
    if (!parsed.success)
      return json(
        {
          error: 'invalid',
          message:
            'Please check your name, email, phone number and selected time.',
        },
        400,
      );
    // Use only Netlify's trusted connection header, never a visitor-supplied
    // forwarded address. Store a keyed hash, not the IP itself.
    const ip =
      process.env.NETLIFY === 'true'
        ? request.headers.get('x-nf-client-connection-ip')
        : null;
    const secret = process.env.AUTH_SECRET;
    const clientHash =
      ip && secret
        ? createHmac('sha256', secret).update(`callback:${ip}`).digest('hex')
        : null;
    const saved = await reserveCallback(prisma, parsed.data, clientHash);
    // A provider or connection failure must not turn a saved reservation into
    // an apparent failed booking. The existing email job retries its archive.
    const notification = await deliverCallbackEmail(
      prisma,
      saved.emailMessageId,
    ).catch(() => 'pending' as const);
    return json(
      {
        ok: true,
        startAt: saved.startAt.toISOString(),
        endAt: saved.endAt.toISOString(),
        notification,
      },
      notification === 'sent' ? 201 : 202,
    );
  } catch (error) {
    if (error instanceof RangeError)
      return json(
        {
          error: 'too_large',
          message: 'Please keep your question under 2,000 characters.',
        },
        413,
      );
    if (error instanceof SyntaxError)
      return json(
        { error: 'invalid', message: 'Please check the form and try again.' },
        400,
      );
    if (error instanceof CallbackError) {
      const messages = {
        slot_unavailable:
          'That time is no longer available. Please choose another time.',
        request_conflict:
          'This request has already been used. Please refresh the page before making a different request.',
        rate_limited: `You have reached the callback request limit. Please call ${site.phone} if you need help.`,
      };
      return json(
        { error: error.code, message: messages[error.code] },
        error.code === 'rate_limited' ? 429 : 409,
      );
    }
    return json({ error: 'unavailable', message: unavailable }, 503);
  }
}
