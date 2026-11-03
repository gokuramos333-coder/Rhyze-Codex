import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(async () => ({ queued: 0 })),
  settings: vi.fn(async () => ({
    replyTo: 'owner@example.test',
    postalAddress: 'Studio',
  })),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/domain/engagement/member-absence', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/domain/engagement/member-absence')
  >()),
  prepareAbsenceFollowUp: mocks.prepare,
}));
vi.mock('@/lib/newsletters/repository', () => ({
  settings: mocks.settings,
  loadCustomers: async () => [],
  origin: () => 'https://example.test',
}));
import { POST } from '@/app/api/jobs/member-absence/route';
function request(key = 'test-secret') {
  return new Request('https://example.test/api/jobs/member-absence', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
  });
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('cloud absence job authorization and timing', () => {
  function setup() {
    vi.stubEnv('JOB_SECRET', 'test-secret');
    vi.stubEnv('MEMBER_ABSENCE_ENABLED', 'true');
    vi.stubEnv('MEMBER_ABSENCE_START_AT', '2026-11-04T05:00Z');
    vi.stubEnv('EMAIL_FROM', 'studio@example.test');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T14:00Z'));
  }
  it('requires the job secret', async () => {
    setup();
    expect((await POST(request('wrong'))).status).toBe(401);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('does nothing until enabled with a valid future launch boundary', async () => {
    setup();
    vi.stubEnv('MEMBER_ABSENCE_ENABLED', 'false');
    expect(await (await POST(request())).json()).toEqual({ paused: true });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('runs at nine Eastern and allows same-day recovery, never overnight', async () => {
    setup();
    await POST(request());
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-11-04T18:00Z'));
    await POST(request());
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date('2026-11-05T02:00Z'));
    expect(await (await POST(request())).json()).toEqual({
      outsideWindow: true,
    });
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
  });
});
