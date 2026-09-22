import { NextRequest, NextResponse } from 'next/server';
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE,
  captureFirstTouch,
} from '@/lib/attribution/first-touch';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    request.cookies.has(ATTRIBUTION_COOKIE) ||
    path.startsWith('/api/') ||
    path.startsWith('/_next/') ||
    /\.[a-z0-9]+$/i.test(path) ||
    request.method === 'HEAD' ||
    request.headers.has('next-router-prefetch') ||
    request.headers.get('purpose') === 'prefetch'
  )
    return NextResponse.next();

  const value = JSON.stringify(
    captureFirstTouch(request.nextUrl, request.headers.get('referer')),
  );
  // Make attribution available to server actions on this request as well.
  const requestHeaders = new Headers(request.headers);
  const existing = requestHeaders.get('cookie');
  requestHeaders.set(
    'cookie',
    `${existing ? `${existing}; ` : ''}${ATTRIBUTION_COOKIE}=${encodeURIComponent(value)}`,
  );
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(ATTRIBUTION_COOKIE, value, {
    maxAge: ATTRIBUTION_MAX_AGE,
    sameSite: 'lax',
    path: '/',
    httpOnly: false,
    secure: request.nextUrl.protocol === 'https:',
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)'],
};
