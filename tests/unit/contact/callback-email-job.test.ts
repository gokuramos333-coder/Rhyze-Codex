import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/jobs/email/route';
const mocks = vi.hoisted(() => ({
  due: vi.fn(),
  review: vi.fn(),
  claim: vi.fn(),
  update: vi.fn(),
  callback: vi.fn(),
  send: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailMessage: {
      findMany: mocks.due,
      updateMany: mocks.claim,
      update: mocks.update,
    },
    emailTemplateReview: { findMany: mocks.review },
  },
}));
vi.mock('@/lib/domain/contact/callback-email', async (original) => ({
  ...(await original<typeof import('@/lib/domain/contact/callback-email')>()),
  deliverCallbackEmail: mocks.callback,
}));
vi.mock('@/lib/notifications/class-reminder-delivery', () => ({
  classReminderIsDeliverable: async () => true,
}));
vi.mock('@/lib/domain/accounts/account-token-delivery', () => ({
  accountTokenEmailIsDeliverable: async () => true,
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));
const request = () =>
  new Request('http://localhost/api/jobs/email', {
    method: 'POST',
    headers: { authorization: 'Bearer local-test' },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('JOB_SECRET', 'local-test');
  vi.stubEnv('EMAIL_DELIVERY_ENABLED', 'true');
  vi.stubEnv('EMAIL_FROM', 'local@example.test');
  vi.stubEnv('RESEND_API_KEY', 'test-not-a-key');
  vi.stubEnv('EMAIL_DELIVERY_RESUME_AT', '');
  mocks.review.mockResolvedValue([
    { template: 'CONTACT_FORM', copyOverride: null },
  ]);
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.update.mockResolvedValue({});
  mocks.send.mockResolvedValue({ data: { id: 'provider-id' }, error: null });
  mocks.callback.mockResolvedValue('sent');
});
afterEach(() => vi.unstubAllEnvs());
describe('callback recovery in the existing email job', () => {
  it('delegates callbacks to the same idempotent sender and keeps standard email handling intact', async () => {
    mocks.due.mockResolvedValue([
      {
        id: 'callback',
        template: 'CONTACT_FORM',
        dedupeKey: 'callback-request:test',
      },
      {
        id: 'normal',
        template: 'CONTACT_FORM',
        subject: 'Website message',
        payload: {},
        to: 'local@example.test',
        toList: [],
        cc: [],
        bcc: [],
        replyTo: [],
        attachments: [],
      },
    ]);
    const response = await POST(request());
    expect(await response.json()).toMatchObject({
      queued: 2,
      delivered: 2,
      failed: 0,
    });
    expect(mocks.callback).toHaveBeenCalledTimes(1);
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.due.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'PROCESSING',
          dedupeKey: { startsWith: 'callback-request:' },
        }),
      ]),
    );
  });
  it('keeps a callback recovery error from stopping other notifications', async () => {
    mocks.due.mockResolvedValue([
      {
        id: 'callback',
        template: 'CONTACT_FORM',
        dedupeKey: 'callback-request:test',
      },
      {
        id: 'next-callback',
        template: 'CONTACT_FORM',
        dedupeKey: 'callback-request:next',
      },
    ]);
    mocks.callback.mockRejectedValueOnce(new Error('Transient read failure'));
    expect(await (await POST(request())).json()).toMatchObject({
      delivered: 1,
      failed: 1,
    });
  });
  it('does no work when outgoing email is paused', async () => {
    vi.stubEnv('EMAIL_DELIVERY_ENABLED', 'false');
    expect(await (await POST(request())).json()).toMatchObject({
      paused: true,
    });
    expect(mocks.due).not.toHaveBeenCalled();
    expect(mocks.callback).not.toHaveBeenCalled();
  });
});
