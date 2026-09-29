import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTrustedAdminOrigin } from '@/lib/auth/request-origin';

afterEach(() => vi.unstubAllEnvs());
const request = (origin?: string, url = 'http://localhost:3000/api/admin/schedule/import', extra = {}) => new Request(url, { headers: { ...extra, ...(origin ? { origin } : {}) } });
describe('trusted admin mutation origin behind a hosting proxy', () => {
  it('accepts only the configured public origin even when the internal URL differs', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com/');
    expect(isTrustedAdminOrigin(request('https://www.rhyzefitness.com'))).toBe(true);
    for (const origin of [undefined, 'null', 'https://evil.test', 'http://localhost:3000', 'https://www.rhyzefitness.com.evil.test']) {
      expect(isTrustedAdminOrigin(request(origin))).toBe(false);
    }
  });
  it('does not trust request or forwarded hosts to override the configured origin', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com');
    expect(isTrustedAdminOrigin(request('https://evil.test', 'https://evil.test/api', { host: 'evil.test', 'x-forwarded-host': 'evil.test' }))).toBe(false);
  });
  it('fails closed for invalid or absent production configuration', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const config of ['', 'broken', 'file:///tmp/app']) {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', config);
      expect(isTrustedAdminOrigin(request('https://www.rhyzefitness.com', 'https://www.rhyzefitness.com/api'))).toBe(false);
    }
  });
  it('allows same-origin local development without production configuration', () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(isTrustedAdminOrigin(request('http://localhost:3000'))).toBe(true);
    expect(isTrustedAdminOrigin(request('https://evil.test'))).toBe(false);
  });
});
