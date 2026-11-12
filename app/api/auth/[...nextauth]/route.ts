import { handlers } from '@/auth';
import { authRequestOrigin } from '@/lib/auth/auth-handler-request';
import type { NextRequest } from 'next/server';

export function GET(request: NextRequest) {
  const scoped = authRequestOrigin(request);
  return scoped ? handlers.GET(scoped) : new Response('Invalid authentication origin', { status: 400 });
}

export function POST(request: NextRequest) {
  const scoped = authRequestOrigin(request);
  return scoped ? handlers.POST(scoped) : new Response('Invalid authentication origin', { status: 400 });
}
