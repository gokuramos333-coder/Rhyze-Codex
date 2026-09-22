import { describe, expect, it } from 'vitest';
import { verifyLiveHttp } from '../../../scripts/release/http-smoke';

// The transport is the only fake: exercise the real cookie, identity, role,
// content and asset checks without contacting clients or charging a card.
function transport(fault = '') {
  const requests: { path: string; method: string }[] = [];
  const page =
    '<html><main>Rhyze Fitness — classes and memberships</main><link href="/_next/static/app.css" rel="stylesheet"><script src="/_next/static/app.js"></script></html>';
  const fetcher: typeof fetch = async (input, options) => {
    const path = new URL(String(input)).pathname;
    const method = options?.method || 'GET';
    requests.push({ path, method });
    const cookie = new Headers(options?.headers).get('cookie') || '';
    const email = cookie.replace('session=', '');
    const role = email.includes('admin')
      ? 'OWNER'
      : email.includes('instructor')
        ? 'INSTRUCTOR'
        : 'MEMBER';
    const html = (body: string) =>
      new Response(body, { headers: { 'content-type': 'text/html' } });
    if (path === '/api/auth/csrf') return Response.json({ csrfToken: 'csrf' });
    if (path === '/api/auth/callback/credentials') {
      const form = new URLSearchParams(String(options?.body));
      return new Response('{}', {
        headers: {
          'set-cookie': `session=${form.get('email')}; HttpOnly; Path=/`,
        },
      });
    }
    if (path === '/api/auth/session')
      return Response.json({
        user: {
          email,
          role: fault === 'identity' ? 'MEMBER' : role,
          status: 'ACTIVE',
        },
      });
    if (/^\/(admin|member|instructor)(\/|$)/.test(path)) {
      if (!cookie)
        return new Response(null, {
          status: 307,
          headers: { location: '/sign-in' },
        });
      if (
        (path.startsWith('/admin') && role !== 'OWNER') ||
        (path.startsWith('/instructor') && role === 'MEMBER')
      ) {
        if (fault === 'role') return html(page);
        return new Response(null, {
          status: 307,
          headers: { location: '/member' },
        });
      }
      if (path === '/admin/integrations')
        return html(
          `${page}<p>Mode: ${fault === 'test-mode' ? 'test' : 'live'} · Checkout: ready · Webhooks: ready</p>`,
        );
    }
    if (path.endsWith('.css'))
      return new Response(fault === 'asset-html' ? page : 'body{color:white}', {
        status: fault === 'asset-404' ? 404 : 200,
        headers: {
          'content-type': fault === 'asset-html' ? 'text/html' : 'text/css',
        },
      });
    if (path.endsWith('.js'))
      return new Response('console.log("loaded")', {
        headers: { 'content-type': 'application/javascript' },
      });
    if (path === '/icon' || path === '/apple-icon')
      return new Response('image', {
        headers: { 'content-type': 'image/png' },
      });
    if (fault === 'redirect')
      return new Response(null, {
        status: 302,
        headers: { location: 'https://wrong.test' },
      });
    if (fault === 'blank') return html('<html></html>');
    return html(page);
  };
  return { fetcher, requests };
}
describe('post-release live HTTP checks', () => {
  it('verifies real role-policy boundaries, production mode and generated assets without purchase actions', async () => {
    const { fetcher, requests } = transport();
    const report = await verifyLiveHttp({
      fetcher,
      passwordFor: () => 'test-only',
    });
    expect(report.roles).toEqual(['OWNER', 'INSTRUCTOR', 'MEMBER']);
    expect(report.stripeMode).toBe('live');
    expect(report.assets).toBe(2);
    expect(
      requests.filter((x) => x.method !== 'GET').map((x) => x.path),
    ).toEqual(Array(3).fill('/api/auth/callback/credentials'));
    expect(report.limitations.join(' ')).toMatch(/card|settlement/i);
  });
  it.each([
    'test-mode',
    'asset-html',
    'asset-404',
    'identity',
    'role',
    'redirect',
    'blank',
  ])(
    'fails instead of calling an unsafe %s response healthy',
    async (fault) => {
      const { fetcher } = transport(fault);
      await expect(
        verifyLiveHttp({ fetcher, passwordFor: () => 'test-only' }),
      ).rejects.toThrow();
    },
  );
  it('does not silently omit authenticated checks when secure test credentials are missing', async () => {
    const { fetcher } = transport();
    await expect(
      verifyLiveHttp({
        fetcher,
        passwordFor: () => {
          throw Error('not available');
        },
      }),
    ).rejects.toThrow();
  });
});
