import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let runProtectedJob: typeof import('../../../netlify/lib/run-protected-job').runProtectedJob;

describe('scheduled job transport', () => {
  const fetch = vi.fn();
  const options = { retryConnectFailures: true } as const;
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubEnv('URL', 'https://studio.example');
    vi.stubEnv('JOB_SECRET', 'private-test-secret');
    vi.stubGlobal('fetch', fetch);
    fetch.mockReset();
    vi.resetModules();
    ({ runProtectedJob } = await import('../../../netlify/lib/run-protected-job'));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('retries a pre-connection failure once without waiting an hour', async () => {
    fetch.mockRejectedValueOnce(new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }))
      .mockResolvedValueOnce(Response.json({ synced: 0, unchanged: 36 }));
    const result = runProtectedJob('/api/jobs/stripe-sync', undefined, options);
    const assertion = expect(result).resolves.toEqual({ synced: 0, unchanged: 36 });
    await Promise.all([assertion, vi.runAllTimersAsync()]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].signal).toBe(fetch.mock.calls[1][1].signal);
    expect(fetch.mock.calls[0][1].redirect).toBe('error');
  });

  it.each(['UND_ERR_SOCKET', 'ECONNRESET', 'UND_ERR_HEADERS_TIMEOUT', undefined])(
    'does not replay a request whose result is uncertain (%s)', async (code) => {
      fetch.mockRejectedValue(new TypeError('private transport details', { cause: { code } }));
      await expect(runProtectedJob('/api/jobs/stripe-sync', undefined, options)).rejects.toThrow('transport failed');
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('bounds repeated DNS/connect failures to two attempts', async () => {
    fetch.mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'EAI_AGAIN' } }));
    const assertion = expect(runProtectedJob('/api/jobs/stripe-sync', undefined, options)).rejects.toThrow('transport failed');
    await Promise.all([assertion, vi.runAllTimersAsync()]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not retry or disclose server error bodies', async () => {
    fetch.mockResolvedValue(new Response('private provider response', { status: 503 }));
    await expect(runProtectedJob('/api/jobs/stripe-sync', undefined, options)).rejects.toThrow(/^\/api\/jobs\/stripe-sync failed with HTTP 503$/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('leaves cancellation and email jobs single-attempt', async () => {
    fetch.mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'EAI_AGAIN' } }));
    await expect(runProtectedJob('/api/jobs/email')).rejects.toThrow('transport failed');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('refuses to enable retry for a different job', async () => {
    await expect(runProtectedJob('/api/jobs/email', undefined, options)).rejects.toThrow('only enabled for Stripe safety sync');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps authenticated POST/body behavior intact', async () => {
    fetch.mockResolvedValue(Response.json({ ok: true }));
    await runProtectedJob('/api/jobs/email', { limit: 10 });
    expect(fetch).toHaveBeenCalledWith('https://studio.example/api/jobs/email', expect.objectContaining({
      method: 'POST', headers: { authorization: 'Bearer private-test-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 10 }),
    }));
  });
  it('aborts a stalled request at the shared deadline without replaying it', async () => {
    fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const start = Date.now();
    const assertion = expect(runProtectedJob('/api/jobs/stripe-sync', undefined, options)).rejects.toThrow('deadline exceeded');
    await Promise.all([assertion, vi.runAllTimersAsync()]);
    expect(Date.now() - start).toBe(25_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not start a retry backoff when the deadline is too close', async () => {
    fetch.mockImplementation(() => new Promise((_resolve, reject) => {
      setTimeout(() => reject(new TypeError('fetch failed', { cause: { code: 'EAI_AGAIN' } })), 24_900);
    }));
    const assertion = expect(runProtectedJob('/api/jobs/stripe-sync', undefined, options)).rejects.toThrow('transport failed');
    await Promise.all([assertion, vi.runAllTimersAsync()]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not replay an unreadable successful response', async () => {
    fetch.mockResolvedValue(new Response('not JSON', { status: 200 }));
    await expect(runProtectedJob('/api/jobs/stripe-sync', undefined, options)).rejects.toThrow('incomplete or invalid response');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
