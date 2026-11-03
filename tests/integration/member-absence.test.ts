import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import {
  absenceRunDay,
  absenceKey,
  absenceStillDeliverable,
  prepareAbsenceFollowUp,
} from '@/lib/domain/engagement/member-absence';
import { renderNewsletter } from '@/lib/newsletters/render';
import type { FrozenNewsletter } from '@/lib/newsletters/delivery';
import type { Customer } from '@/lib/newsletters/domain';
const url = process.env.NEWSLETTER_TEST_DATABASE_URL;
if (
  !url ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
  new URL(url).pathname !== '/rhyze_newsletter_preview'
)
  throw Error('Disposable newsletter database only');
const db = new PrismaClient({ datasourceUrl: url });
const prefix = 'absence-test-' + randomUUID();
const now = new Date('2035-11-05T14:00:00Z');
const enabledAt = new Date(+now - 86400000);
const userId = prefix + '-member';
const visitId = prefix + '-visit';
const last = new Date(+now - 7 * 86400000 - 1000);
const customer = {
  id: userId,
  name: '  Test   Member  ',
  email: userId + '@example.test',
  membership: 'Active member',
  accountStatus: 'ACTIVE',
  consent: 'OPTED_IN',
  doNotContact: false,
  suppression: null,
} as Customer;
const input = {
  now,
  enabledAt,
  customers: [customer],
  origin: 'http://localhost:3000',
  sender: 'Test <test@example.test>',
  replyTo: 'owner@example.test',
  postalAddress: 'Test studio',
  outreachEnabled: true,
};
describe('one re-engagement email per real absence, with daily owner digest', () => {
  afterAll(async () => db.$disconnect());
  it('uses 9 AM Eastern on both sides of daylight-saving changes', () => {
    expect(absenceRunDay(new Date('2026-10-31T13:00Z'))).toEqual({
      day: '2026-10-31',
      hour: 9,
    });
    expect(absenceRunDay(new Date('2026-11-03T14:00Z'))).toEqual({
      day: '2026-11-03',
      hour: 9,
    });
  });
  it('queues once despite concurrent runs, with no direct provider sends', async () => {
    await db.emailMessage.deleteMany({
      where: {
        dedupeKey: {
          in: [
            'absence-report:2035-11-05:vanessa@rhyzefit.com',
            'absence-report:2035-11-05:melissa@rhyzefit.com',
            'absence-report:2035-11-06:vanessa@rhyzefit.com',
            'absence-report:2035-11-06:melissa@rhyzefit.com',
            'absence-report:2035-11-07:vanessa@rhyzefit.com',
            'absence-report:2035-11-07:melissa@rhyzefit.com',
            'absence-report:2035-11-12:vanessa@rhyzefit.com',
            'absence-report:2035-11-12:melissa@rhyzefit.com',
          ],
        },
      },
    });
    await db.user.upsert({
      where: { email: 'vanessa@rhyzefit.com' },
      update: {},
      create: {
        email: 'vanessa@rhyzefit.com',
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
    await db.user.create({
      data: {
        id: userId,
        email: customer.email,
        name: customer.name,
        status: 'ACTIVE',
      },
    });
    await db.classCategory.create({
      data: { id: prefix, name: 'Absence test', slug: prefix },
    });
    await db.classTemplate.create({
      data: {
        id: prefix,
        slug: prefix,
        categoryId: prefix,
        name: 'Test class',
        description: 'Isolated fixture',
        durationMinutes: 50,
        defaultCapacity: 20,
        tags: [],
        equipment: [],
      },
    });
    await db.classOccurrence.create({
      data: {
        id: prefix,
        templateId: prefix,
        startAt: last,
        endAt: new Date(+last + 3000000),
        capacity: 20,
      },
    });
    await db.attendanceRecord.create({
      data: {
        id: visitId,
        userId,
        occurrenceId: prefix,
        status: 'CHECKED_IN',
        checkedInAt: last,
      },
    });
    await Promise.all([
      prepareAbsenceFollowUp(db, input),
      prepareAbsenceFollowUp(db, input),
    ]);
    const id = absenceKey(userId, visitId);
    expect(
      await db.newsletterRecipient.count({ where: { campaignId: id } }),
    ).toBe(1);
    expect(
      await db.emailMessage.count({
        where: { dedupeKey: { startsWith: 'absence-report:2035-11-05:' } },
      }),
    ).toBe(2);
    const campaign = await db.emailCampaign.findUniqueOrThrow({
      where: { id },
    });
    const recipient = await db.newsletterRecipient.findFirstOrThrow({
      where: { campaignId: id },
    });
    expect(recipient.firstName).toBe('Test');
    const rendered = renderNewsletter({
      ...(campaign.sentSnapshot as unknown as FrozenNewsletter),
      firstName: recipient.firstName || undefined,
      unsubscribeUrl: 'http://localhost:3000/newsletter/unsubscribe/test',
    });
    expect(rendered.subject).toBe('We miss you, Test 💛');
    expect(rendered.html).toContain('We miss you, Test 💛');
    expect(rendered.text).not.toContain('Rhyze Tribe');
    expect(await absenceStillDeliverable(db, campaign.sentSnapshot, now)).toBe(
      true,
    );
    await db.classOccurrence.create({
      data: {
        id: prefix + '-future',
        templateId: prefix,
        startAt: new Date(+now + 86400000),
        endAt: new Date(+now + 90000000),
        capacity: 20,
      },
    });
    await db.booking.create({
      data: { userId, occurrenceId: prefix + '-future' },
    });
    expect(await absenceStillDeliverable(db, campaign.sentSnapshot, now)).toBe(
      false,
    );
  });
  it('does not blast historical absences or opted-out members', async () => {
    for (const kind of ['history', 'optout', 'never', 'event']) {
      const uid = prefix + '-' + kind;
      await db.user.create({
        data: { id: uid, email: uid + '@example.test', status: 'ACTIVE' },
      });
      if (kind === 'never') continue;
      const at = kind === 'history' ? new Date(+now - 30 * 86400000) : last;
      let templateId = prefix;
      if (kind === 'event') {
        templateId = prefix + '-event';
        await db.classTemplate.create({
          data: {
            id: templateId,
            slug: templateId,
            categoryId: prefix,
            name: 'Test event',
            description: 'Fixture',
            isEvent: true,
            durationMinutes: 50,
            defaultCapacity: 20,
            tags: [],
            equipment: [],
          },
        });
      }
      await db.classOccurrence.create({
        data: {
          id: uid,
          templateId,
          startAt: at,
          endAt: new Date(+at + 3000000),
          capacity: 20,
        },
      });
      await db.attendanceRecord.create({
        data: {
          id: uid,
          userId: uid,
          occurrenceId: uid,
          status: 'CHECKED_IN',
          checkedInAt: at,
        },
      });
    }
    const customers = ['history', 'optout', 'never', 'event'].map((kind) => ({
      ...customer,
      id: prefix + '-' + kind,
      email: prefix + '-' + kind + '@example.test',
      consent: kind === 'optout' ? 'OPTED_OUT' : 'OPTED_IN',
    }));
    await prepareAbsenceFollowUp(db, {
      ...input,
      now: new Date(+now + 86400000),
      customers,
    });
    expect(
      await db.newsletterRecipient.count({
        where: { userId: { in: customers.map((c) => c.id) } },
      }),
    ).toBe(0);
  });
  it('initial catch-up is exact, keeps opt-outs, and cannot resend the same absence', async () => {
    const runAt = new Date(+now + 3 * 86400000);
    await db.emailMessage.deleteMany({
      where: { dedupeKey: { startsWith: 'absence-report:2035-11-08:' } },
    });
    const customers = ['history', 'optout'].map((kind) => ({
      ...customer,
      id: prefix + '-' + kind,
      email: prefix + '-' + kind + '@example.test',
      consent: kind === 'optout' ? 'OPTED_OUT' : 'OPTED_IN',
    }));
    const result = await prepareAbsenceFollowUp(db, {
      ...input,
      now: runAt,
      customers,
      historicalUserIds: [prefix + '-history', prefix + '-optout'],
    });
    expect(result.queued).toBe(1);
    expect(
      await db.newsletterRecipient.count({
        where: { userId: prefix + '-history' },
      }),
    ).toBe(1);
    expect(
      await db.newsletterRecipient.count({
        where: { userId: prefix + '-optout' },
      }),
    ).toBe(0);
    expect(
      await prepareAbsenceFollowUp(db, {
        ...input,
        now: runAt,
        customers,
        historicalUserIds: [prefix + '-history'],
      }),
    ).toMatchObject({ alreadyPrepared: true, queued: 0 });
  });
  it('does not queue more outreach after the daily batch, and reports exclusions truthfully', async () => {
    expect(
      await prepareAbsenceFollowUp(db, {
        ...input,
        now: new Date(+now + 2 * 3600000),
      }),
    ).toMatchObject({ alreadyPrepared: true, queued: 0 });
    await db.booking.updateMany({
      where: { userId, occurrenceId: prefix + '-future' },
      data: { status: 'CANCELLED' },
    });
    await db.newsletterRecipient.updateMany({
      where: { userId },
      data: { status: 'EXCLUDED', exclusionReason: 'Marketing opted out' },
    });
    await db.emailCampaign.updateMany({
      where: { id: absenceKey(userId, visitId) },
      data: { status: 'SENT' },
    });
    await prepareAbsenceFollowUp(db, {
      ...input,
      now: new Date(+now + 2 * 86400000),
    });
    const report = await db.emailMessage.findUniqueOrThrow({
      where: { dedupeKey: 'absence-report:2035-11-07:vanessa@rhyzefit.com' },
      include: { attachments: true },
    });
    const csv = Buffer.from(report.attachments[0].content).toString('utf8');
    const row = csv.split('\n').find((r) => r.includes(customer.email));
    expect(row).toContain('Email not sent: Marketing opted out');
    expect(row).not.toContain('Email sent');
  });
  it('a genuine return resets the absence key and eligibility', async () => {
    await db.booking.updateMany({
      where: { userId, occurrenceId: prefix + '-future' },
      data: { status: 'CANCELLED' },
    });
    const returnAt = new Date(+now - 3600000);
    await db.classOccurrence.create({
      data: {
        id: prefix + '-return',
        templateId: prefix,
        startAt: returnAt,
        endAt: new Date(+returnAt + 3000000),
        capacity: 20,
      },
    });
    await db.attendanceRecord.create({
      data: {
        id: prefix + '-return',
        userId,
        occurrenceId: prefix + '-return',
        status: 'ATTENDED',
        checkedInAt: now,
      },
    });
    const old = await db.emailCampaign.findUniqueOrThrow({
      where: { id: absenceKey(userId, visitId) },
    });
    expect(await absenceStillDeliverable(db, old.sentSnapshot, now)).toBe(
      false,
    );
    await prepareAbsenceFollowUp(db, {
      ...input,
      now: new Date(+now + 7 * 86400000),
    });
    expect(await db.newsletterRecipient.count({ where: { userId } })).toBe(2);
  });
});
