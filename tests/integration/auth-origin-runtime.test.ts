import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import type { IncomingMessage } from 'node:http';
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const NextServer = require('next/dist/server/next-server').default;
const { NextRequestAdapter } = require('next/dist/server/web/spec-extension/adapters/next-request');
const canonical = 'www.rhyzefitness.com';
const immutable = '6af4ab2ffc4707328af308a6--rhyze-fitness-rhyze-2.netlify.app';
const id = 'auth-origin-' + randomUUID();
const email = `${id}@example.invalid`;
const password = 'Synthetic-origin-only-762!';
let routes: typeof import('../../app/api/auth/[...nextauth]/route');
let db: PrismaClient;
let fixtureCreated = false;

// Execute the installed Next methods used by the Netlify adapter. The adapter
// retains hostname/port from its first request (server.js:3149-3158).
function request(firstHost: string, host: string, path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  const node = { url: path, method: 'GET', headers: { host, 'x-forwarded-proto': 'https' } };
  NextServer.prototype.attachRequestMeta.call(
    { fetchHostname: firstHost, port: 443, nextConfig: { experimental: {} } }, node, { query: {} }, true,
  );
  const adapted = NextRequestAdapter.fromNodeNextRequest(node as unknown as IncomingMessage, new AbortController().signal) as NextRequest;
  return new NextRequest(adapted.url, { ...init, headers: { ...Object.fromEntries(adapted.headers), ...Object.fromEntries(new Headers(init?.headers)) } });
}
function jar(response: Response, previous = '') {
  const map = new Map(previous.split('; ').filter(Boolean).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  for (const value of response.headers.getSetCookie()) {
    expect(value.toLowerCase()).not.toContain('domain=');
    const pair = value.split(';')[0]; map.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1));
  }
  return [...map].map(([k,v]) => `${k}=${v}`).join('; ');
}
async function login(firstHost: string, host: string, callbackHost = host) {
  const csrf = await routes.GET(request(firstHost, host, '/api/auth/csrf'));
  const cookies = jar(csrf);
  const body = new URLSearchParams({ csrfToken: (await csrf.json()).csrfToken, email, password, callbackUrl: `https://${callbackHost}/member` });
  const response = await routes.POST(request(firstHost, host, '/api/auth/callback/credentials', { method: 'POST', body, headers: { cookie: cookies, 'content-type': 'application/x-www-form-urlencoded', 'x-auth-return-redirect': '1', origin: `https://${host}` } }));
  expect(response.status).toBe(200);
  const destination = (await response.json()).url;
  expect(new URL(destination).origin).toBe(`https://${host}`);
  const sessionCookies = jar(response, cookies);
  const session = await routes.GET(request(firstHost, host, '/api/auth/session', { headers: { cookie: sessionCookies } }));
  expect((await session.json()).user.email).toBe(email);
  // Host-only cookie jars stay separate; a different browser origin has no session.
  const anonymous = await routes.GET(request(firstHost, host === canonical ? immutable : canonical, '/api/auth/session'));
  expect(await anonymous.json()).toBeNull();
  return sessionCookies;
}
beforeAll(async () => {
  const url = new URL(process.env.CALLBACK_TEST_DATABASE_URL || 'http://invalid');
  const directory = process.env.TRIAL_TEST_DATABASE_DIR;
  if (process.env.NODE_ENV !== 'test' || !directory || !isAbsolute(directory) || !['postgresql:', 'postgres:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/callback_test' || url.search || url.hash) throw Error('Explicit owned callback_test database required');
  process.env.DATABASE_URL = url.href;
  process.env.AUTH_SECRET = 'synthetic-local-origin-test-secret-not-production';
  process.env.AUTH_TRUST_HOST = 'true';
  delete process.env.AUTH_URL; delete process.env.NEXTAUTH_URL;
  db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const rows = await db.$queryRaw<Array<{ directory: string; name: string; address: string; port: number }>>`SELECT current_setting('data_directory') AS directory, current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port`;
  expect(rows[0]).toEqual({ directory: await realpath(directory), name: 'callback_test', address: '127.0.0.1', port: Number(url.port) });
  await db.user.create({ data: { id: id, email, name: 'Synthetic Origin', role: 'MEMBER', status: 'ACTIVE', passwordHash: await hash(password) } });
  fixtureCreated = true;
  routes = await import('../../app/api/auth/[...nextauth]/route');
}, 30000);
afterAll(async () => { if (db) { if (fixtureCreated) await db.user.deleteMany({ where: { id } }); await db.$disconnect(); } });

describe('installed Next / actual Auth.js route / disposable PostgreSQL', () => {
  it('isolates the Next adapter defect before Auth.js sees the request', () => {
    const req = request(immutable, canonical, '/api/auth/providers');
    expect(new URL(req.url).hostname).toBe(immutable);
    expect(req.headers.get('host')).toBe(canonical);
  });
  for (const first of [immutable, canonical]) {
    it(`alternating origins, first ${first}`, async () => {
      for (const host of [first, first === canonical ? immutable : canonical, first]) {
        const providers = await routes.GET(request(first, host, '/api/auth/providers'));
        expect(new URL((await providers.json()).credentials.callbackUrl).origin).toBe(`https://${host}`);
        await login(first, host);
      }
    });
    it(`concurrent origins, first ${first}`, async () => {
      await Promise.all([canonical, immutable, canonical, immutable].map(host => login(first, host)));
    });
  }
  it('rejects cross-origin callback destinations and signs out on current origin', async () => {
    const cookies = await login(immutable, canonical, immutable);
    const csrf = await routes.GET(request(immutable, canonical, '/api/auth/csrf', { headers: { cookie: cookies } }));
    const response = await routes.POST(request(immutable, canonical, '/api/auth/signout', { method: 'POST', headers: { cookie: jar(csrf, cookies), 'content-type': 'application/x-www-form-urlencoded', 'x-auth-return-redirect': '1' }, body: new URLSearchParams({ csrfToken: (await csrf.json()).csrfToken, callbackUrl: `https://${canonical}/sign-in` }) }));
    expect(new URL((await response.json()).url).origin).toBe(`https://${canonical}`);
    const session = await routes.GET(request(immutable, canonical, '/api/auth/session', { headers: { cookie: jar(response, cookies) } }));
    expect(await session.json()).toBeNull();
  });
  it('rejects an untrusted host without issuing cookies', async () => {
    for (const host of ['attacker.example', `${immutable}.evil.example`, 'branch--rhyze-fitness-rhyze-2.netlify.app']) {
      const response = await routes.GET(request(immutable, host, '/api/auth/providers'));
      expect(response.status).toBe(400); expect(response.headers.getSetCookie()).toEqual([]);
    }
  });
});
