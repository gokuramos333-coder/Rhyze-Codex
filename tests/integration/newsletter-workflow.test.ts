import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { logOutreach, loadCustomers } from '@/lib/newsletters/repository';
import {
  createCampaign,
  saveCampaign,
  campaignReview,
  approveCampaign,
  cancelCampaign,
  deleteCampaign,
  prepareCampaign,
} from '@/lib/newsletters/campaigns';
import {
  runNewsletterBatch,
  newsletterWebhook,
  unsubscribe,
} from '@/lib/newsletters/delivery';
import { sendNewsletterTest } from '@/lib/newsletters/test-delivery';
import { defaultAudience, eligibility } from '@/lib/newsletters/domain';
// Validate before application imports instantiate Prisma; this file has its own
// disposable database, independent of the other release integration suites.
vi.hoisted(() => {
  const raw = process.env.NEWSLETTER_TEST_DATABASE_URL;
  if (!raw) throw Error('Explicit isolated newsletter test database required.');
  const u = new URL(raw);
  if (
    !['postgres:', 'postgresql:'].includes(u.protocol) ||
    !['localhost', '127.0.0.1'].includes(u.hostname) ||
    u.pathname !== '/rhyze_newsletter_preview' ||
    u.search ||
    u.hash
  )
    throw Error('Refusing non-preview database');
  vi.stubEnv('DATABASE_URL', raw);
  vi.stubEnv('NEWSLETTER_CAPTURE', 'true');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:4317');
  vi.stubEnv('EMAIL_REPLY_TO', 'preview@example.test');
});
const actor = {
  id: 'nl-actor-' + randomUUID(),
  name: 'Preview Admin',
  email: 'nl-actor-' + randomUUID() + '@example.test',
};
const users: string[] = [];
const campaigns: string[] = [];
const testArchives: string[] = [];
const sender = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sender };
  },
}));
async function customer(consent: 'OPTED_IN' | 'UNKNOWN' = 'OPTED_IN') {
  const id = 'nl-test-' + randomUUID();
  users.push(id);
  await prisma.user.create({
    data: {
      id,
      email: id + '@example.test',
      name: 'Integration Customer',
      status: 'ACTIVE',
      role: 'MEMBER',
      notificationPreference: { create: { marketingEmail: true } },
      leadProfile: {
        create: {
          consent,
          consentSource:
            consent === 'OPTED_IN' ? 'Synthetic test consent' : null,
          assignedToId: actor.id,
        },
      },
    },
  });
  return id;
}
async function draft() {
  const c = await createCampaign(actor.id, {
    templateType: 'MEMBERSHIP',
    name: 'Integration ' + randomUUID(),
  });
  campaigns.push(c.id);
  return saveCampaign(actor.id, {
    id: c.id,
    version: c.version,
    name: c.name,
    subject: c.subject,
    previewText: c.previewText || '',
    document: c.document,
    audience: { ...defaultAudience(), assignedToId: actor.id },
    targetWeek: c.targetWeek!,
    scheduleMode: 'AUTO',
  });
}
async function approve(c: { id: string; version: number }) {
  const r = await campaignReview(c.id);
  expect(r.errors).toEqual([]);
  await approveCampaign(actor.id, c.id, c.version, r.hash);
}
beforeAll(async () => {
  await prisma.user.create({
    data: { ...actor, role: 'OWNER', status: 'ACTIVE' },
  });
});
afterAll(async () => {
  await prisma.emailMessage.deleteMany({ where: { id: { in: testArchives } } });
  await prisma.newsletterEvent.deleteMany({
    where: { recipient: { campaignId: { in: campaigns } } },
  });
  const messages = await prisma.newsletterRecipient.findMany({
    where: { campaignId: { in: campaigns } },
    select: { emailMessageId: true },
  });
  await prisma.newsletterRecipient.deleteMany({
    where: { campaignId: { in: campaigns } },
  });
  await prisma.emailMessage.deleteMany({
    where: {
      id: {
        in: messages.flatMap((m) =>
          m.emailMessageId ? [m.emailMessageId] : [],
        ),
      },
    },
  });
  await prisma.emailCampaign.deleteMany({ where: { id: { in: campaigns } } });
  await prisma.marketingSuppression.deleteMany({
    where: { email: { in: users.map((id) => id + '@example.test') } },
  });
  await prisma.customerOutreach.deleteMany({
    where: { userId: { in: users } },
  });
  await prisma.customerLeadProfile.deleteMany({
    where: { userId: { in: users } },
  });
  await prisma.notificationPreference.deleteMany({
    where: { userId: { in: users } },
  });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});
describe('Newsletter and outreach persistence — isolated PostgreSQL', () => {
  it.each(['ACTIVE', 'INVITED'] as const)(
    'automatically includes a new %s profile without writing opt-in evidence',
    async (status) => {
      const id = 'nl-test-' + randomUUID();
      users.push(id);
      await prisma.user.create({
        data: {
          id,
          email: id + '@example.test',
          name: 'Synthetic new profile',
          role: 'MEMBER',
          status,
        },
      });
      const c = (await loadCustomers()).find((x) => x.id === id)!;
      expect(c.marketingApproval).toBe('CUSTOMER_PROFILE');
      expect(c.consent).toBe('UNKNOWN');
      expect(c.consentSource).toBe('');
      expect(eligibility(c)).toBeNull();
      expect(
        await prisma.customerLeadProfile.findUnique({ where: { userId: id } }),
      ).toBeNull();
      await prisma.notificationPreference.create({
        data: { userId: id, marketingEmail: false },
      });
      const optedOut = (await loadCustomers()).find((x) => x.id === id)!;
      expect(eligibility(optedOut)).toBe('Marketing opted out');
    },
  );

  it('logs staff identity once; status and notes do not increment contact attempts', async () => {
    const id = await customer();
    const op = randomUUID();
    const x = await logOutreach(actor, {
      userId: id,
      version: 0,
      operationKey: op,
      type: 'OUTREACH',
      method: 'TEXT',
      outcome: 'INTERESTED',
    });
    expect(x.actorInitials).toBe('PA');
    expect(x.attempt).toBe(1);
    expect(
      (
        await logOutreach(actor, {
          userId: id,
          version: 0,
          operationKey: op,
          type: 'OUTREACH',
          method: 'TEXT',
        })
      ).id,
    ).toBe(x.id);
    const p = await prisma.customerLeadProfile.findUniqueOrThrow({
      where: { userId: id },
    });
    await logOutreach(actor, {
      userId: id,
      version: 1,
      operationKey: randomUUID(),
      type: 'STATUS',
      outcome: 'FOLLOW_UP_NEEDED',
    });
    const after = await prisma.customerLeadProfile.findUniqueOrThrow({
      where: { userId: id },
    });
    expect(after.lastContactedAt).toEqual(p.lastContactedAt);
    expect(
      await prisma.customerOutreach.count({
        where: { userId: id, type: 'OUTREACH' },
      }),
    ).toBe(1);
    await logOutreach(actor, {
      userId: id,
      version: 2,
      operationKey: randomUUID(),
      type: 'OUTREACH',
      method: 'TEXT',
    });
    expect(
      await prisma.customerOutreach.count({
        where: { userId: id, type: 'OUTREACH' },
      }),
    ).toBe(2);
  });
  it('does not silently accept simultaneous staff updates', async () => {
    const id = await customer();
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        logOutreach(actor, {
          userId: id,
          version: 0,
          operationKey: randomUUID(),
          type: 'OUTREACH',
          method: 'CALL',
        }),
      ),
    );
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.customerOutreach.count({ where: { userId: id } })).toBe(
      1,
    );
  });
  it('DNC blocks outreach while converted status never creates a membership', async () => {
    const id = await customer();
    await logOutreach(actor, {
      userId: id,
      version: 0,
      operationKey: randomUUID(),
      type: 'STATUS',
      outcome: 'CONVERTED',
    });
    expect(await prisma.membership.count({ where: { userId: id } })).toBe(0);
    await logOutreach(actor, {
      userId: id,
      version: 1,
      operationKey: randomUUID(),
      type: 'STATUS',
      outcome: 'DO_NOT_CONTACT',
    });
    await expect(
      logOutreach(actor, {
        userId: id,
        version: 2,
        operationKey: randomUUID(),
        type: 'OUTREACH',
        method: 'CALL',
      }),
    ).rejects.toThrow('Do Not Contact');
  });
  it('draft saving and duplication never copy approval or recipients', async () => {
    const c = await draft();
    expect(
      await prisma.newsletterRecipient.count({ where: { campaignId: c.id } }),
    ).toBe(0);
    await approve(c);
    const copy = await createCampaign(actor.id, { duplicateId: c.id });
    campaigns.push(copy.id);
    expect(copy.id).not.toBe(c.id);
    expect(copy.status).toBe('DRAFT');
    expect(copy.approvedAt).toBeNull();
    expect(copy.sentSnapshot).toBeNull();
    expect(
      await prisma.newsletterRecipient.count({
        where: { campaignId: copy.id },
      }),
    ).toBe(0);
    await cancelCampaign(actor.id, c.id);
  });
  it('deletes only the chosen unsent draft and retains an audit record', async () => {
    const c = await draft();
    const other = await draft();
    await deleteCampaign(actor.id, c.id, c.version);
    expect(
      await prisma.emailCampaign.findUnique({ where: { id: c.id } }),
    ).toBeNull();
    expect(
      await prisma.emailCampaign.findUnique({ where: { id: other.id } }),
    ).not.toBeNull();
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: c.id,
          action: 'NEWSLETTER_DELETED',
          actorId: actor.id,
        },
      }),
    ).toBe(1);
    await expect(deleteCampaign(actor.id, c.id, c.version)).rejects.toThrow(
      'unavailable',
    );
  });
  it('rejects stale deletes and requires scheduled campaigns to be cancelled first', async () => {
    const c = await draft();
    await expect(deleteCampaign(actor.id, c.id, c.version - 1)).rejects.toThrow(
      'changed',
    );
    await approve(c);
    const scheduled = await prisma.emailCampaign.findUniqueOrThrow({
      where: { id: c.id },
    });
    await expect(
      deleteCampaign(actor.id, c.id, scheduled.version),
    ).rejects.toThrow('Cancel');
    await cancelCampaign(actor.id, c.id);
    const cancelled = await prisma.emailCampaign.findUniqueOrThrow({
      where: { id: c.id },
    });
    await deleteCampaign(actor.id, c.id, cancelled.version);
    expect(
      await prisma.emailCampaign.findUnique({ where: { id: c.id } }),
    ).toBeNull();
  });
  it('concurrent deletion requests retain exactly one deletion audit', async () => {
    const c = await draft();
    const results = await Promise.allSettled([
      deleteCampaign(actor.id, c.id, c.version),
      deleteCampaign(actor.id, c.id, c.version),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.auditLog.count({
        where: { entityId: c.id, action: 'NEWSLETTER_DELETED' },
      }),
    ).toBe(1);
  });
  it('preserves recipient history even after cancellation', async () => {
    await customer();
    const c = await draft();
    await approve(c);
    await prepareCampaign(c.id);
    await cancelCampaign(actor.id, c.id);
    const cancelled = await prisma.emailCampaign.findUniqueOrThrow({
      where: { id: c.id },
    });
    await expect(
      deleteCampaign(actor.id, c.id, cancelled.version),
    ).rejects.toThrow('history');
    expect(
      await prisma.newsletterRecipient.count({ where: { campaignId: c.id } }),
    ).toBeGreaterThan(0);
  });
  it('preserves sent and legacy campaigns', async () => {
    for (const patch of [
      { status: 'SENT' as const, sentAt: new Date() },
      { templateType: 'LEGACY' },
    ]) {
      const c = await draft();
      const saved = await prisma.emailCampaign.update({
        where: { id: c.id },
        data: patch,
      });
      await expect(
        deleteCampaign(actor.id, c.id, saved.version),
      ).rejects.toThrow('history');
      expect(
        await prisma.emailCampaign.findUnique({ where: { id: c.id } }),
      ).not.toBeNull();
    }
  });
  it('edits require reapproval and stale version saves fail', async () => {
    const c = await draft();
    await approve(c);
    const approved = await prisma.emailCampaign.findUniqueOrThrow({
      where: { id: c.id },
    });
    const saved = await saveCampaign(actor.id, {
      id: c.id,
      version: approved.version,
      name: c.name,
      subject: 'Changed subject',
      previewText: '',
      document: c.document,
      audience: c.audience,
      targetWeek: c.targetWeek!,
      scheduleMode: 'AUTO',
    });
    expect(saved.status).toBe('NEEDS_REVIEW');
    expect(saved.approvedAt).toBeNull();
    await expect(
      saveCampaign(actor.id, {
        id: c.id,
        version: approved.version,
        name: c.name,
        subject: 'Stale',
        previewText: '',
        document: c.document,
        audience: c.audience,
        targetWeek: c.targetWeek!,
        scheduleMode: 'AUTO',
      }),
    ).rejects.toThrow('Another admin');
  });
  it('concurrent dispatchers capture each recipient once and preserve exact archived content', async () => {
    await customer();
    const c = await draft();
    await approve(c);
    await Promise.allSettled([runNewsletterBatch(), runNewsletterBatch()]);
    const r = await prisma.newsletterRecipient.findMany({
      where: { campaignId: c.id },
      include: { emailMessage: true },
    });
    expect(r.filter((x) => x.status === 'CAPTURED').length).toBeGreaterThan(0);
    expect(new Set(r.map((x) => x.emailMessageId).filter(Boolean)).size).toBe(
      r.filter((x) => x.status === 'CAPTURED').length,
    );
    expect(r.find((x) => x.emailMessage)?.emailMessage?.htmlBody).toContain(
      'Unsubscribe',
    );
    expect(r.some((x) => x.emailMessage?.providerId)).toBe(false);
    const frozen = await prisma.emailCampaign.findUniqueOrThrow({
      where: { id: c.id },
    });
    await expect(
      saveCampaign(actor.id, {
        id: c.id,
        version: frozen.version,
        name: c.name,
        subject: 'Rewrite sent email',
        previewText: '',
        document: c.document,
        audience: c.audience,
        targetWeek: c.targetWeek!,
        scheduleMode: 'AUTO',
      }),
    ).rejects.toThrow('immutable');
    const ids = r.map((x) => x.id).sort();
    await runNewsletterBatch();
    expect(
      (
        await prisma.newsletterRecipient.findMany({
          where: { campaignId: c.id },
        })
      )
        .map((x) => x.id)
        .sort(),
    ).toEqual(ids);
  });
  it('reviews and captures an owner-approved profile without rewriting its consent', async () => {
    const id = await customer('UNKNOWN');
    const c = await draft();
    const review = await campaignReview(c.id);
    expect(review.recipients.eligible.some((r) => r.customer.id === id)).toBe(
      true,
    );
    await approve(c);
    await runNewsletterBatch();
    const recipient = await prisma.newsletterRecipient.findFirstOrThrow({
      where: { campaignId: c.id, userId: id },
    });
    expect(recipient.status).toBe('CAPTURED');
    const profile = await prisma.customerLeadProfile.findUniqueOrThrow({
      where: { userId: id },
    });
    expect(profile.consent).toBe('UNKNOWN');
    expect(profile.consentSource).toBeNull();
  });
  it('dispatch honors opt-out after approval without changing personal outreach', async () => {
    const id = await customer();
    const c = await draft();
    await approve(c);
    await prisma.notificationPreference.update({
      where: { userId: id },
      data: { marketingEmail: false },
    });
    await runNewsletterBatch();
    const r = await prisma.newsletterRecipient.findFirst({
      where: { campaignId: c.id, userId: id },
    });
    expect(r?.status).toBe('EXCLUDED');
    expect(await prisma.customerOutreach.count({ where: { userId: id } })).toBe(
      0,
    );
  });
  it('cancelled and future campaigns do not dispatch', async () => {
    const c = await draft();
    await approve(c);
    await cancelCampaign(actor.id, c.id);
    await runNewsletterBatch();
    expect(
      await prisma.newsletterRecipient.count({ where: { campaignId: c.id } }),
    ).toBe(0);
    const f = await draft();
    const date = new Date(Date.now() + 86400000);
    const r = await campaignReview(f.id, date);
    await approveCampaign(actor.id, f.id, f.version, r.hash, date);
    await runNewsletterBatch();
    expect(
      await prisma.newsletterRecipient.count({ where: { campaignId: f.id } }),
    ).toBe(0);
    await cancelCampaign(actor.id, f.id);
  });
  it('signed-handler events deduplicate, out-of-order opens do not undo delivery, unsubscribe preserves account', async () => {
    const id = await customer();
    const c = await draft();
    await approve(c);
    await runNewsletterBatch();
    const r = await prisma.newsletterRecipient.findFirstOrThrow({
      where: { campaignId: c.id, userId: id },
    });
    const providerId = 'local-provider-' + randomUUID();
    await prisma.emailMessage.update({
      where: { id: r.emailMessageId! },
      data: { providerId },
    });
    const evt = 'test-svix-' + randomUUID();
    const body = {
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: { email_id: providerId },
    };
    await newsletterWebhook(evt, body);
    await newsletterWebhook(evt, body);
    await newsletterWebhook(evt + '-open', {
      ...body,
      type: 'email.opened',
      created_at: new Date(Date.now() - 60000).toISOString(),
    });
    expect(
      await prisma.newsletterEvent.count({
        where: { recipientId: r.id, type: 'email.delivered' },
      }),
    ).toBe(1);
    await unsubscribe(r.token);
    expect(await prisma.user.findUnique({ where: { id } })).not.toBeNull();
    expect(
      (
        await prisma.notificationPreference.findUniqueOrThrow({
          where: { userId: id },
        })
      ).marketingEmail,
    ).toBe(false);
    expect(await prisma.customerOutreach.count({ where: { userId: id } })).toBe(
      0,
    );
  });
});

// Network responses below are mocked; the same durable production worker uses only local fixtures.
describe('Provider uncertainty and approval holds', () => {
  it('holds an approved campaign after sender configuration changes', async () => {
    const c = await draft();
    await approve(c);
    const prior = process.env.EMAIL_FROM;
    process.env.EMAIL_FROM = 'Changed <changed@example.test>';
    try {
      await prepareCampaign(c.id);
      const held = await prisma.emailCampaign.findUniqueOrThrow({
        where: { id: c.id },
      });
      expect(held.status).toBe('NEEDS_REVIEW');
      expect(held.holdReason).toContain('Sender/settings');
      expect(
        await prisma.newsletterRecipient.count({ where: { campaignId: c.id } }),
      ).toBe(0);
    } finally {
      if (prior) process.env.EMAIL_FROM = prior;
      else delete process.env.EMAIL_FROM;
    }
  });
  it('retries an explicit rate limit with the same idempotency key and archived content', async () => {
    const c = await draft();
    await approve(c);
    await prepareCampaign(c.id);
    const rs = await prisma.newsletterRecipient.findMany({
      where: { campaignId: c.id, status: 'QUEUED' },
    });
    expect(rs.length).toBeGreaterThan(0);
    await prisma.newsletterRecipient.updateMany({
      where: { campaignId: c.id, id: { not: rs[0].id } },
      data: { status: 'EXCLUDED' },
    });
    const original = {
      capture: process.env.NEWSLETTER_CAPTURE,
      delivery: process.env.NEWSLETTER_DELIVERY_ENABLED,
      email: process.env.EMAIL_DELIVERY_ENABLED,
      key: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
    };
    Object.assign(process.env, {
      NEWSLETTER_CAPTURE: 'false',
      NEWSLETTER_DELIVERY_ENABLED: 'true',
      EMAIL_DELIVERY_ENABLED: 'true',
      RESEND_API_KEY: 'mock-no-network',
      EMAIL_FROM: 'Test <test@example.test>',
    });
    sender
      .mockReset()
      .mockResolvedValueOnce({
        error: { name: 'rate_limit_exceeded' },
        data: null,
      })
      .mockResolvedValueOnce({
        error: null,
        data: { id: 'mock-' + randomUUID() },
      });
    try {
      await runNewsletterBatch();
      expect(
        (
          await prisma.newsletterRecipient.findUniqueOrThrow({
            where: { id: rs[0].id },
          })
        ).status,
      ).toBe('RETRY');
      await prisma.newsletterRecipient.update({
        where: { id: rs[0].id },
        data: { nextAttemptAt: new Date(0) },
      });
      await runNewsletterBatch();
      expect(sender).toHaveBeenCalledTimes(2);
      expect(sender.mock.calls[0]).toEqual(sender.mock.calls[1]);
      expect(
        (
          await prisma.newsletterRecipient.findUniqueOrThrow({
            where: { id: rs[0].id },
          })
        ).status,
      ).toBe('ACCEPTED');
    } finally {
      for (const [k, v] of Object.entries({
        NEWSLETTER_CAPTURE: original.capture,
        NEWSLETTER_DELIVERY_ENABLED: original.delivery,
        EMAIL_DELIVERY_ENABLED: original.email,
        RESEND_API_KEY: original.key,
        EMAIL_FROM: original.from,
      })) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
  it('does not retry after provider timeout or interrupted acceptance', async () => {
    const c = await draft();
    await approve(c);
    await prepareCampaign(c.id);
    const rs = await prisma.newsletterRecipient.findMany({
      where: { campaignId: c.id, status: 'QUEUED' },
    });
    await prisma.newsletterRecipient.updateMany({
      where: { campaignId: c.id, id: { not: rs[0].id } },
      data: { status: 'EXCLUDED' },
    });
    const keys = [
      'NEWSLETTER_CAPTURE',
      'NEWSLETTER_DELIVERY_ENABLED',
      'EMAIL_DELIVERY_ENABLED',
      'RESEND_API_KEY',
      'EMAIL_FROM',
    ];
    const previous = keys.map((k) => process.env[k]);
    Object.assign(process.env, {
      NEWSLETTER_CAPTURE: 'false',
      NEWSLETTER_DELIVERY_ENABLED: 'true',
      EMAIL_DELIVERY_ENABLED: 'true',
      RESEND_API_KEY: 'mock-no-network',
      EMAIL_FROM: 'Test <test@example.test>',
    });
    sender.mockReset().mockRejectedValue(new Error('mock timeout'));
    try {
      await runNewsletterBatch();
      await runNewsletterBatch();
      expect(sender).toHaveBeenCalledTimes(1);
      expect(
        (
          await prisma.newsletterRecipient.findUniqueOrThrow({
            where: { id: rs[0].id },
          })
        ).status,
      ).toBe('UNKNOWN');
    } finally {
      keys.forEach((k, i) => {
        if (previous[i] === undefined) delete process.env[k];
        else process.env[k] = previous[i];
      });
    }
  });
});

describe('Allowlisted test emails', () => {
  it('captures a test once without enrolling recipients or counting newsletter delivery', async () => {
    const c = await draft();
    const input = {
      id: c.id,
      recipient: 'preview@example.test',
      operationKey: randomUUID(),
    };
    const a = await sendNewsletterTest(actor, input);
    testArchives.push(a.archiveId);
    const b = await sendNewsletterTest(actor, input);
    expect(a).toEqual(b);
    expect(a.status).toBe('CAPTURED');
    expect(
      await prisma.newsletterRecipient.count({ where: { campaignId: c.id } }),
    ).toBe(0);
    expect(
      (
        await prisma.emailMessage.findUniqueOrThrow({
          where: { id: a.archiveId },
        })
      ).providerId,
    ).toBeNull();
  });
  it('blocks external test requests without an approved allowlist before any provider call', async () => {
    const c = await draft();
    const previous = process.env.NEWSLETTER_CAPTURE;
    process.env.NEWSLETTER_CAPTURE = 'false';
    sender.mockClear();
    try {
      await expect(
        sendNewsletterTest(actor, {
          id: c.id,
          recipient: 'not-allowed@example.test',
          operationKey: randomUUID(),
        }),
      ).rejects.toThrow('approved test recipient');
      expect(sender).not.toHaveBeenCalled();
    } finally {
      process.env.NEWSLETTER_CAPTURE = previous;
    }
  });
});
