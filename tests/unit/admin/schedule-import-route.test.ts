import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ owner: vi.fn(), publish: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: mocks.owner }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/lib/admin/schedule-import', async actual => ({ ...await actual<object>(), importSchedule: mocks.publish }));
import { POST } from '@/app/api/admin/schedule/import/route';
const body = { month: '2026-10', reason: 'Owner supplied calendar', dryRun: true, slots: [{ templateId: 'template', instructorId: 'instructor', roomId: 'room', localStart: '2026-10-16T19:30', durationMinutes: 50, priceCents: 1500, isEvent: false, title: 'Class with Instructor' }] };
const request = (payload = body, origin = 'https://www.rhyzefitness.com') => new Request('https://www.rhyzefitness.com/api/admin/schedule/import', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
describe('owner schedule import boundary', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('accepts the configured website origin through an internal hosting URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com');
    const proxied = new Request('http://localhost:3000/api/admin/schedule/import', { method: 'POST', headers: { origin: 'https://www.rhyzefitness.com', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await POST(proxied)).status).toBe(200);
    expect(mocks.publish).toHaveBeenCalledWith({}, body, 'owner');
  });
  beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com'); vi.clearAllMocks(); mocks.owner.mockResolvedValue({ id: 'owner' }); mocks.publish.mockResolvedValue({ dryRun: true, wouldCreate: 1, created: 0 }); });
  it('rejects cross-origin and unauthorized requests before publication', async () => {
    expect((await POST(request(body, 'https://other.test'))).status).toBe(403);
    mocks.owner.mockRejectedValue(new Error('denied'));
    await expect(POST(request())).rejects.toThrow('denied');
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('requires valid strict input and uses authenticated audit identity', async () => {
    expect((await POST(request({ ...body, slots: [] }))).status).toBe(400);
    expect((await POST(request())).status).toBe(200);
    expect(mocks.publish).toHaveBeenCalledWith({}, body, 'owner');
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('refreshes calendar surfaces only after a completed publication', async () => {
    await POST(request({ ...body, dryRun: false }));
    expect(mocks.revalidate).toHaveBeenCalledWith('/schedule');
    mocks.revalidate.mockClear(); mocks.publish.mockRejectedValue(new Error('conflict'));
    expect((await POST(request({ ...body, dryRun: false }))).status).toBe(409);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
