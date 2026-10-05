import { execFileSync } from 'node:child_process';
import {
  AUTOMATION_TEST_ACCOUNTS,
  type AutomationTestAccount,
} from '../../lib/automation/test-accounts';
import { verifyPortalAccess } from '../../lib/automation/portal-smoke-policy';
import { ORIGIN } from './guards';

function securePassword(account: AutomationTestAccount) {
  try {
    return execFileSync(
      '/usr/bin/security',
      [
        'find-generic-password',
        '-s',
        account.keychainService,
        '-a',
        account.email,
        '-w',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 },
    ).trim();
  } catch {
    throw Error(
      `Secure ${account.role} automation credentials unavailable; portal checks cannot be skipped.`,
    );
  }
}

export async function verifyLiveHttp(
  options: {
    fetcher?: typeof fetch;
    passwordFor?: (account: AutomationTestAccount) => string;
  } = {},
) {
  const fetcher = options.fetcher || fetch;
  const assets = new Set<string>();
  const roles: string[] = [];
  const request = (path: string, init: RequestInit = {}) =>
    fetcher(ORIGIN + path, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });
  async function html(response: Response, label: string) {
    const body = await response.text();
    if (
      response.status !== 200 ||
      !response.headers.get('content-type')?.includes('text/html') ||
      /application error:|internal server error|service unavailable/i.test(
        body,
      ) ||
      !/<(?:main|nav|h1)\b/i.test(body)
    )
      throw Error(`${label}: invalid, blank, redirected, or error page.`);
    for (const match of body.matchAll(
      /(?:src|href)="(\/_next\/static\/[^"?]+)(?:\?[^"]*)?"/g,
    )) {
      const path = match[1].replaceAll('&amp;', '&');
      if (/\.(js|css)$/.test(path)) assets.add(path);
    }
    return body;
  }
  for (const path of [
    '/',
    '/memberships',
    '/join',
    '/schedule',
    '/events',
    '/instructors',
    '/contact',
  ])
    await html(await request(path), path);
  for (const path of ['/icon', '/apple-icon']) {
    const response = await request(path);
    if (
      response.status !== 200 ||
      !response.headers.get('content-type')?.startsWith('image/') ||
      !(await response.arrayBuffer()).byteLength
    )
      throw Error(`${path}: icon missing.`);
  }
  function denied(response: Response, path: string, anonymous = false) {
    const location = response.headers.get('location');
    const target = location ? new URL(location, ORIGIN) : null;
    if (
      response.status < 300 ||
      response.status >= 400 ||
      !target ||
      target.origin !== ORIGIN ||
      target.pathname.startsWith(path) ||
      (anonymous && target.pathname !== '/sign-in')
    )
      throw Error(`${path}: access restriction failed.`);
  }
  for (const path of ['/admin', '/member', '/instructor']) {
    const response = await request(path);
    denied(response, path, true);
    await response.body?.cancel();
  }
  for (const account of AUTOMATION_TEST_ACCOUNTS) {
    const cookies = new Map<string, string>();
    async function authenticated(path: string, init: RequestInit = {}) {
      const response = await request(path, {
        ...init,
        headers: {
          ...init.headers,
          cookie: [...cookies]
            .map(([key, value]) => `${key}=${value}`)
            .join('; '),
        },
      });
      for (const line of response.headers.getSetCookie()) {
        const pair = line.split(';')[0];
        const index = pair.indexOf('=');
        if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
      return response;
    }
    const password = (options.passwordFor || securePassword)(account);
    if (!password) throw Error(`${account.role}: missing secure password.`);
    const csrfResponse = await authenticated('/api/auth/csrf');
    if (csrfResponse.status !== 200)
      throw Error(`${account.role}: CSRF unavailable.`);
    const csrf = (await csrfResponse.json()) as { csrfToken?: string };
    if (!csrf.csrfToken) throw Error(`${account.role}: missing CSRF token.`);
    const login = await authenticated('/api/auth/callback/credentials', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'X-Auth-Return-Redirect': '1',
        origin: ORIGIN,
      },
      body: new URLSearchParams({
        csrfToken: csrf.csrfToken,
        email: account.email,
        password,
        callbackUrl: ORIGIN + account.expectedPath,
      }),
    });
    await login.body?.cancel();
    if (login.status >= 400)
      throw Error(`${account.role}: authentication failed.`);
    const sessionResponse = await authenticated('/api/auth/session');
    const session = (await sessionResponse.json()) as {
      user?: { email?: string; role?: string; status?: string };
    };
    if (
      sessionResponse.status !== 200 ||
      session.user?.email !== account.email ||
      session.user.role !== account.role ||
      session.user.status !== 'ACTIVE'
    )
      throw Error(`${account.role}: session identity mismatch.`);
    await verifyPortalAccess(account.role, {
      open: async (path) => {
        await html(await authenticated(path), `${account.role} ${path}`);
      },
      deny: async (path) => {
        const response = await authenticated(path);
        denied(response, path);
        await response.body?.cancel();
      },
    });
    if (account.role === 'OWNER') {
      const plain = (
        await html(await authenticated('/admin/integrations'), 'Stripe runtime')
      ).replace(/<[^>]+>/g, ' ');
      if (
        !/Mode:\s*live\b/.test(plain) ||
        !/Checkout:\s*ready\b/.test(plain) ||
        !/Webhooks:\s*ready\b/.test(plain) ||
        !/Customer portal:\s*ready\b/.test(plain)
      )
        throw Error(
          'Production runtime does not report LIVE Stripe checkout, webhook and customer portal readiness.',
        );
    }
    roles.push(account.role);
    // Session cookies/passwords stay in memory only. No purchase/booking/email POSTs.
  }
  if (
    ![...assets].some((path) => path.endsWith('.css')) ||
    ![...assets].some((path) => path.endsWith('.js'))
  )
    throw Error('Generated CSS/JS assets were not discovered.');
  for (const path of assets) {
    const response = await request(path);
    const type = response.headers.get('content-type') || '';
    if (
      response.status !== 200 ||
      (path.endsWith('.css')
        ? !type.includes('text/css')
        : !/javascript|ecmascript/.test(type)) ||
      !(await response.arrayBuffer()).byteLength
    )
      throw Error(`Generated asset failed: ${path}`);
  }
  return {
    roles,
    assets: assets.size,
    stripeMode: 'live' as const,
    limitations: [
      'HTTP checks, not a browser interaction/visual audit.',
      'No real card transaction, settlement, new webhook delivery, booking, or email was executed. Automation login updates only normal session/last-login state.',
    ],
  };
}
