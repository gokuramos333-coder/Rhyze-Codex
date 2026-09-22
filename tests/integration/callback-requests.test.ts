import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  getCallbackAvailability,
  reserveCallback,
} from '@/lib/domain/contact/callback-service';
import { deliverCallbackEmail } from '@/lib/domain/contact/callback-email';
import { EMAIL_TEMPLATE_REVISION } from '@/lib/notifications/email-templates';
import { site } from '@/lib/site';

const url = process.env.CALLBACK_TEST_DATABASE_URL;
if (
  url &&
  (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/callback_test')
) {
  throw new Error(
    'Callback tests require the explicit disposable local callback_test database',
  );
}

describe.skipIf(!url)(
  'callback reservations and notifications on PostgreSQL',
  () => {
    const db = new PrismaClient({ datasourceUrl: url });
    const prefix = `callback-test-${randomUUID()}`;
    const now = new Date('2026-09-21T09:00Z');
    const input = (changes = {}) => ({
      requestKey: randomUUID(),
      startAt: '2026-09-22T15:00:00.000Z',
      name: 'Callback Prospect',
      email: `${prefix}@example.test`,
      phone: '(973) 555-0100',
      message: 'Which membership fits me?',
      website: '' as const,
      ...changes,
    });
    async function clean() {
      await db.callbackRequest.deleteMany({
        where: { email: { contains: prefix } },
      });
      await db.emailMessage.deleteMany({
        where: { replyTo: { has: `${prefix}@example.test` } },
      });
      await db.classOccurrence.deleteMany({ where: { templateId: prefix } });
    }
    beforeAll(async () => {
      await db.classCategory.create({
        data: { id: prefix, name: prefix, slug: prefix },
      });
      await db.classTemplate.create({
        data: {
          id: prefix,
          categoryId: prefix,
          slug: prefix,
          name: 'Synthetic event',
          description: 'Test only',
          durationMinutes: 60,
          defaultCapacity: 25,
          dropInPriceCents: 3000,
          isEvent: true,
        },
      });
      await db.emailTemplateReview.upsert({
        where: { template: 'CONTACT_FORM' },
        update: { revision: EMAIL_TEMPLATE_REVISION },
        create: {
          template: 'CONTACT_FORM',
          revision: EMAIL_TEMPLATE_REVISION,
          approvedById: prefix,
          approvedByEmail: 'review@example.test',
        },
      });
    });
    beforeEach(clean);
    afterAll(async () => {
      await clean();
      await db.emailMessage.deleteMany({
        where: { subject: { contains: prefix } },
      });
      await db.classTemplate.delete({ where: { id: prefix } });
      await db.classCategory.delete({ where: { id: prefix } });
      await db.emailTemplateReview.deleteMany({
        where: { approvedById: prefix },
      });
      await db.$disconnect();
    });
    it('saves the request and a complete management email together, never emailing the visitor', async () => {
      const result = await reserveCallback(db, input(), 'hashed-client', now);
      const email = await db.emailMessage.findUniqueOrThrow({
        where: { id: result.emailMessageId },
      });
      expect(email).toMatchObject({
        to: site.emails.melissa,
        template: 'CONTACT_FORM',
        status: 'QUEUED',
        replyTo: [`${prefix}@example.test`],
      });
      expect(email.payload).toMatchObject({
        senderName: 'Callback Prospect',
        senderPhone: '(973) 555-0100',
      });
      expect(JSON.stringify(email.payload)).toContain('11:00 AM');
      expect(JSON.stringify(email.payload)).toContain('September 22');
      expect(JSON.stringify(email.payload)).toContain('America/New_York');
      expect(email.textBody).toContain('(973) 555-0100');
      expect(email.textBody).toContain('Which membership fits me?');
      expect(result.endAt.toISOString()).toBe('2026-09-22T15:15:00.000Z');
      expect(
        (await getCallbackAvailability(db, now)).days.find(
          (day) => day.date === '2026-09-22',
        )!.slots,
      ).not.toContain(result.startAt.toISOString());
    });
    it('rejects an event added after the calendar was loaded, including its buffer', async () => {
      await getCallbackAvailability(db, now);
      await db.classOccurrence.create({
        data: {
          templateId: prefix,
          startAt: new Date('2026-09-22T15:15Z'),
          endAt: new Date('2026-09-22T16:15Z'),
          capacity: 25,
        },
      });
      await expect(
        reserveCallback(db, input(), null, now),
      ).rejects.toMatchObject({ code: 'slot_unavailable' });
      expect(await db.callbackRequest.count()).toBe(0);
    });
    it('allows cancelled classes but rejects closed hours, insufficient notice and distant dates', async () => {
      await db.classOccurrence.create({
        data: {
          templateId: prefix,
          startAt: new Date('2026-09-22T15:00Z'),
          endAt: new Date('2026-09-22T16:00Z'),
          capacity: 25,
          status: 'CANCELLED',
        },
      });
      await reserveCallback(db, input(), null, now);
      for (const startAt of [
        '2026-09-22T10:00:00.000Z',
        '2026-09-21T09:30:00.000Z',
        '2026-11-22T15:00:00.000Z',
      ]) {
        await expect(
          reserveCallback(db, input({ startAt }), null, now),
        ).rejects.toMatchObject({ code: 'slot_unavailable' });
      }
    });
    it('is idempotent, including concurrent double submissions', async () => {
      const request = input();
      const results = await Promise.all([
        reserveCallback(db, request, null, now),
        reserveCallback(db, request, null, now),
      ]);
      expect(results[0].id).toBe(results[1].id);
      expect(await db.callbackRequest.count()).toBe(1);
      expect(
        await db.emailMessage.count({
          where: { id: results[0].emailMessageId },
        }),
      ).toBe(1);
      await expect(
        reserveCallback(
          db,
          { ...request, email: `other-${prefix}@example.test` },
          null,
          now,
        ),
      ).rejects.toMatchObject({ code: 'request_conflict' });
    });
    it('allows only one of two competing visitors to reserve the same time', async () => {
      const results = await Promise.allSettled([
        reserveCallback(db, input(), null, now),
        reserveCallback(db, input({ name: 'Another Prospect' }), null, now),
      ]);
      expect(
        results.filter((item) => item.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(results.filter((item) => item.status === 'rejected')).toHaveLength(
        1,
      );
      expect(await db.callbackRequest.count()).toBe(1);
    });
    it('limits repeat requests even with different request keys and times', async () => {
      for (const hour of [15, 16, 17])
        await reserveCallback(
          db,
          input({ startAt: `2026-09-22T${hour}:00:00.000Z` }),
          null,
          now,
        );
      await expect(
        reserveCallback(
          db,
          input({ startAt: '2026-09-22T18:00:00.000Z' }),
          null,
          now,
        ),
      ).rejects.toMatchObject({ code: 'rate_limited' });
    });
    it('delivers immediately once, with escaped content, correct contact details and a stable provider idempotency key', async () => {
      const request = await reserveCallback(
        db,
        input({ message: '<script>alert(1)</script>' }),
        null,
        now,
      );
      const send = vi
        .fn()
        .mockResolvedValue({ data: { id: randomUUID() }, error: null });
      const options = {
        enabled: true,
        from: 'preview@example.test',
        send,
        now,
      };
      const results = await Promise.all([
        deliverCallbackEmail(db, request.emailMessageId, options),
        deliverCallbackEmail(db, request.emailMessageId, options),
      ]);
      expect(results).toContain('sent');
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toMatchObject({
        to: [site.emails.melissa],
        replyTo: [`${prefix}@example.test`],
      });
      expect(send.mock.calls[0][0].html).not.toContain('<script>');
      expect(send.mock.calls[0][1]).toEqual({
        idempotencyKey: `callback/${request.emailMessageId}`,
      });
      expect(
        await deliverCallbackEmail(db, request.emailMessageId, options),
      ).toBe('sent');
      expect(send).toHaveBeenCalledTimes(1);
    });
    it('retains and retries a failed notification without losing the reservation', async () => {
      const request = await reserveCallback(db, input(), null, now);
      const send = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary outage'))
        .mockResolvedValue({ data: { id: randomUUID() }, error: null });
      const options = {
        enabled: true,
        from: 'preview@example.test',
        send,
        now,
      };
      expect(
        await deliverCallbackEmail(db, request.emailMessageId, options),
      ).toBe('pending');
      const message = await db.emailMessage.findUniqueOrThrow({
        where: { id: request.emailMessageId },
      });
      expect(message.status).toBe('QUEUED');
      expect(message.attempts).toBe(1);
      expect(await db.callbackRequest.count()).toBe(1);
      expect(
        await deliverCallbackEmail(db, request.emailMessageId, options),
      ).toBe('pending');
      expect(send).toHaveBeenCalledTimes(1);
      expect(
        await deliverCallbackEmail(db, request.emailMessageId, {
          ...options,
          now: new Date(now.getTime() + 120_000),
        }),
      ).toBe('sent');
      expect(send.mock.calls[1][1]).toEqual(send.mock.calls[0][1]);
    });
    it('honors delivery pause and template approval without discarding the request', async () => {
      const request = await reserveCallback(db, input(), null, now);
      const send = vi.fn();
      expect(
        await deliverCallbackEmail(db, request.emailMessageId, {
          enabled: false,
          from: 'preview@example.test',
          send,
          now,
        }),
      ).toBe('pending');
      await db.emailTemplateReview.update({
        where: { template: 'CONTACT_FORM' },
        data: { revision: 'unapproved' },
      });
      expect(
        await deliverCallbackEmail(db, request.emailMessageId, {
          enabled: true,
          from: 'preview@example.test',
          send,
          now,
        }),
      ).toBe('pending');
      expect(send).not.toHaveBeenCalled();
      await db.emailTemplateReview.update({
        where: { template: 'CONTACT_FORM' },
        data: { revision: EMAIL_TEMPLATE_REVISION },
      });
    });
    it('freezes the provider payload across retries even if the approved copy or sender changes', async () => {
      const request = await reserveCallback(db, input(), null, now);
      const send = vi
        .fn()
        .mockRejectedValueOnce(new Error('Unknown send outcome'))
        .mockResolvedValue({ data: { id: randomUUID() }, error: null });
      await deliverCallbackEmail(db, request.emailMessageId, {
        enabled: true,
        from: 'first@example.test',
        send,
        now,
      });
      await db.emailTemplateReview.update({
        where: { template: 'CONTACT_FORM' },
        data: { copyOverride: { subject: 'A changed subject' } },
      });
      await deliverCallbackEmail(db, request.emailMessageId, {
        enabled: true,
        from: 'changed@example.test',
        send,
        now: new Date(now.getTime() + 120_000),
      });
      expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
      await db.emailTemplateReview.update({
        where: { template: 'CONTACT_FORM' },
        data: { copyOverride: {} },
      });
    });
    it('recovers an interrupted send lease and stops retries after the idempotency window', async () => {
      const request = await reserveCallback(db, input(), null, now);
      await db.emailMessage.update({
        where: { id: request.emailMessageId },
        data: {
          status: 'PROCESSING',
          attempts: 1,
          updatedAt: new Date(now.getTime() - 360_000),
        },
      });
      const send = vi
        .fn()
        .mockResolvedValue({ data: { id: randomUUID() }, error: null });
      expect(
        await deliverCallbackEmail(db, request.emailMessageId, {
          enabled: true,
          from: 'preview@example.test',
          send,
          now,
        }),
      ).toBe('sent');
      await db.emailMessage.update({
        where: { id: request.emailMessageId },
        data: {
          status: 'PROCESSING',
          updatedAt: new Date(now.getTime() - 360_000),
        },
      });
      expect(
        await deliverCallbackEmail(db, request.emailMessageId, {
          enabled: true,
          from: 'preview@example.test',
          send,
          now: new Date(now.getTime() + 25 * 3_600_000),
        }),
      ).toBe('failed');
      expect(send).toHaveBeenCalledTimes(1);
    });
  },
);
