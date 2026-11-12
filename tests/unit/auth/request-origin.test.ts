import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { authRequestOrigin } from '@/lib/auth/auth-handler-request';
afterEach(() => vi.unstubAllEnvs());
const immutable = '6af4ab2ffc4707328af308a6--rhyze-fitness-rhyze-2.netlify.app';
function request(host: string, extra = {}) {
  return new NextRequest(`https://${immutable}/api/auth/providers?value=kept`, { headers: { host, ...extra } });
}
it('uses current Host without trusting forwarded-host; preserves path/query', () => {
  const result = authRequestOrigin(request('www.rhyzefitness.com', { 'x-forwarded-host': 'attacker.example' }));
  expect(result?.url).toBe('https://www.rhyzefitness.com/api/auth/providers?value=kept');
});
it('rejects malformed, foreign-site, branch and missing hosts', () => {
  for (const host of ['', 'www.rhyzefitness.com:123', 'www.rhyzefitness.com,attacker.example', 'www.rhyzefitness.com@evil.test', '6af4ab2ffc4707328af308a6--other-site.netlify.app', 'branch--rhyze-fitness-rhyze-2.netlify.app']) expect(authRequestOrigin(request(host))).toBeNull();
});
it('preserves explicitly configured matching origin and rejects conflicting override', () => {
  vi.stubEnv('AUTH_URL', 'https://www.rhyzefitness.com');
  expect(authRequestOrigin(request('www.rhyzefitness.com'))).not.toBeNull();
  expect(authRequestOrigin(request(immutable))).toBeNull();
  vi.stubEnv('AUTH_URL', 'malformed');
  expect(authRequestOrigin(request('www.rhyzefitness.com'))).toBeNull();
});
it('allows only loopback local development and rejects it in production', () => {
  vi.stubEnv('NODE_ENV', 'development');
  expect(authRequestOrigin(new NextRequest('http://localhost:3000/api/auth/session', { headers: { host: 'localhost:3000' } }))?.url).toBe('http://localhost:3000/api/auth/session');
  vi.stubEnv('NODE_ENV', 'production');
  expect(authRequestOrigin(request('localhost:3000'))).toBeNull();
});
