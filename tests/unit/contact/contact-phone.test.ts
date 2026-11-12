import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ messages: [] as unknown[] }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async () => ({ data: { id: 'synthetic' }, error: null }) };
  },
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailTemplateReview: {
      findMany: async () => [
        { template: 'CONTACT_FORM' },
        { template: 'CONTACT_CONFIRMATION' },
      ],
    },
    emailMessage: {
      create: async ({ data }: any) => {
        state.messages.push(data);
        return { id: 'test-message' };
      },
      update: async () => ({}),
    },
  },
}));
import { POST } from '@/app/api/contact/route';
beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-only');
  vi.stubEnv('EMAIL_FROM', 'test@example.test');
  state.messages = [];
});
it.each(['bad@example.test', 'letters-only', '123456', '1234567890123456'])(
  'contact route rejects %s before archiving or sending',
  async (phone) => {
    const response = await POST(
      new Request('https://example.test/api/contact', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test',
          email: 'test@example.test',
          phone,
          subject: 'general',
          message: 'Test message',
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(state.messages).toEqual([]);
  },
);
it.each(['', '5550100', '+44 20 7946 0000'])(
  'contact route accepts optional/international phone %j',
  async (phone) => {
    const response = await POST(
      new Request('https://example.test/api/contact', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test',
          email: 'test@example.test',
          phone,
          subject: 'general',
          message: 'Test message',
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(state.messages).toHaveLength(2);
  },
);
