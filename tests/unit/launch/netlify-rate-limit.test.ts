import { afterEach, describe, expect, it, vi } from 'vitest';
const { requestNetlify } = require('../../../scripts/release/hosted-api.cjs');
afterEach(() => vi.useRealTimers());
const limited = (headers: Record<string, string> = {}) =>
  new Response('', { status: 429, headers });
describe('bounded read-only Netlify throttling recovery', () => {
  it.each<Record<string, string>>([
    { 'Retry-After': '10' },
    { 'Retry-After': '1790697610' },
    { 'Retry-After': '1', 'X-RateLimit-Reset': '1790697610' },
    { 'Retry-After': 'Tue, 29 Sep 2026 16:00:10 GMT' },
    { 'X-RateLimit-Reset': '1790697610' },
    { 'X-RateLimit-Reset': '2026-09-29 16:00:10 UTC' },
  ])(
    'waits until provider reset before repeating the identical read (%j)',
    async (headers) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-29T16:00:00Z'));
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(limited(headers))
        .mockResolvedValueOnce(new Response('{"id":"site"}'));
      const result = requestNetlify('getSite', {}, 'private-token', fetcher);
      await vi.advanceTimersByTimeAsync(9999);
      expect(fetcher).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual({ id: 'site' });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[1][0]).toBe(fetcher.mock.calls[0][0]);
      expect(fetcher.mock.calls[1][1].redirect).toBe('error');
    },
  );
  it('uses a one-minute cooldown when reset information is missing', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(new Response('{}'));
    const result = requestNetlify('getEnvVars', {}, 'token', fetcher);
    await vi.advanceTimersByTimeAsync(59999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    'createSiteBuild',
    'createEnvVars',
    'restoreSiteDeploy',
    'lockDeploy',
    'deleteEnvVar',
  ])('never repeats a throttled mutation: %s', async (operation) => {
    const fetcher = vi.fn().mockResolvedValue(limited({ 'Retry-After': '1' }));
    await expect(
      requestNetlify(
        operation,
        { deploy_id: 'candidate', key: 'RHYZE_HOSTED_RELEASE' },
        'token',
        fetcher,
      ),
    ).rejects.toThrow('Sensitive output withheld');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('stops after three read retries and never exposes the error body', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response('private-token', {
            status: 429,
            headers: { 'Retry-After': '1' },
          }),
      );
    const outcome = requestNetlify('getSite', {}, 'token', fetcher).catch(
      (e: Error) => e.message,
    );
    await vi.runAllTimersAsync();
    expect(await outcome).toContain('Sensitive output withheld');
    expect(await outcome).not.toContain('private-token');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('does not retry early when a reset exceeds the bounded wait', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValue(limited({ 'Retry-After': '600' }));
    await expect(
      requestNetlify('getSite', {}, 'token', fetcher),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 500])(
    'does not reinterpret HTTP %s as a rate limit',
    async (status) => {
      const fetcher = vi.fn().mockResolvedValue(new Response('', { status }));
      await expect(
        requestNetlify('getSite', {}, 'token', fetcher),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
});
