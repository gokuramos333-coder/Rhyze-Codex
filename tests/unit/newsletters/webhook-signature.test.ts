import { createHmac } from 'node:crypto';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const processEvent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ duplicate: false }),
);
vi.mock('@/lib/notifications/resend-webhook', () => ({
  processResendWebhook: processEvent,
}));
import { POST } from '@/app/api/resend/webhook/route';
const secret = Buffer.from('isolated-signature-fixture-only').toString(
  'base64',
);
beforeEach(() => {
  vi.stubEnv('RESEND_RECEIVING_API_KEY', 're_fixture_no_network');
  vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_' + secret);
  processEvent.mockReset().mockResolvedValue({ duplicate: false });
});
afterEach(() => vi.unstubAllEnvs());
function request(valid: boolean) {
  const id = 'msg_signature_fixture';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    type: 'email.delivered',
    created_at: new Date().toISOString(),
    data: { email_id: 'mock_email' },
  });
  const signature = createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return new Request('http://localhost/api/resend/webhook', {
    method: 'POST',
    headers: {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': 'v1,' + (valid ? signature : 'invalid'),
    },
    body,
  });
}
it('rejects an invalid signature before event processing', async () => {
  expect((await POST(request(false))).status).toBe(400);
  expect(processEvent).not.toHaveBeenCalled();
});
it('accepts a correctly signed fixture using the existing provider verifier', async () => {
  expect((await POST(request(true))).status).toBe(200);
  expect(processEvent).toHaveBeenCalledOnce();
});
