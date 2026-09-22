import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/contact/callback/route';
import { CallbackError } from '@/lib/domain/contact/callback-service';

const dependencies = vi.hoisted(() => ({
  availability: vi.fn(),
  reserve: vi.fn(),
  deliver: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/domain/contact/callback-service', async (original) => ({
  ...(await original<typeof import('@/lib/domain/contact/callback-service')>()),
  getCallbackAvailability: dependencies.availability,
  reserveCallback: dependencies.reserve,
}));
vi.mock('@/lib/domain/contact/callback-email', () => ({
  deliverCallbackEmail: dependencies.deliver,
}));
const input = {
  requestKey: '9a720260-510e-4e8f-80a3-dd0170f13a41',
  startAt: '2026-09-22T15:00:00.000Z',
  name: 'Prospect',
  email: 'prospect@example.test',
  phone: '9735550100',
  message: '',
  website: '',
};
const request = (body: unknown = input, headers = {}) =>
  new Request('https://www.rhyzefitness.com/api/contact/callback', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://www.rhyzefitness.com',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com');
  dependencies.reserve.mockResolvedValue({
    id: 'private-record-id',
    emailMessageId: 'private-email-id',
    startAt: new Date(input.startAt),
    endAt: new Date('2026-09-22T15:15Z'),
  });
  dependencies.deliver.mockResolvedValue('sent');
});
describe('public callback endpoint', () => {
  it('serves fresh availability only and never performs writes on GET', async () => {
    const availability = {
      timezone: 'America/New_York',
      durationMinutes: 15,
      days: [],
    };
    dependencies.availability.mockResolvedValue(availability);
    const response = await GET();
    expect(await response.json()).toEqual(availability);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(dependencies.reserve).not.toHaveBeenCalled();
  });
  it('fails closed when the schedule cannot be read', async () => {
    dependencies.availability.mockRejectedValue(
      new Error('private database details'),
    );
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private database details');
  });
  it('persists first, immediately sends the notice, and returns no private identifiers', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(dependencies.deliver).toHaveBeenCalledWith({}, 'private-email-id');
    const result = await response.json();
    expect(result).toMatchObject({
      ok: true,
      notification: 'sent',
      startAt: input.startAt,
    });
    expect(JSON.stringify(result)).not.toContain('private-');
  });
  it('acknowledges a durable reservation with a pending notice instead of encouraging another booking', async () => {
    dependencies.deliver.mockResolvedValue('pending');
    expect((await POST(request())).status).toBe(202);
    dependencies.deliver.mockRejectedValue(
      new Error('database network failure after reservation'),
    );
    expect((await POST(request())).status).toBe(202);
  });
  it.each([
    ['wrong origin', input, { origin: 'https://evil.example' }, 403],
    ['not JSON', input, { 'content-type': 'text/plain' }, 415],
    ['oversize', 'x'.repeat(9000), {}, 413],
    ['malformed', '{', {}, 400],
    ['invalid phone', { ...input, phone: '1' }, {}, 400],
    ['honeypot', { ...input, website: 'spam' }, {}, 400],
  ])('rejects %s without writing', async (_, body, headers, status) => {
    expect((await POST(request(body, headers))).status).toBe(status);
    expect(dependencies.reserve).not.toHaveBeenCalled();
  });
  it.each([
    ['slot_unavailable', 409],
    ['rate_limited', 429],
    ['request_conflict', 409],
  ] as const)('handles %s safely', async (code, status) => {
    dependencies.reserve.mockRejectedValue(new CallbackError(code));
    expect((await POST(request())).status).toBe(status);
    expect(dependencies.deliver).not.toHaveBeenCalled();
  });
});
