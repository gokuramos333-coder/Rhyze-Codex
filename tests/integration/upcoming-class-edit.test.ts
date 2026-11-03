import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient, type ClassOccurrence } from '@prisma/client';
vi.mock('server-only', () => ({}));
import { editUpcomingClasses } from '@/lib/domain/schedule/edit-upcoming';
import {
  occurrenceLocalInputValue,
  parseOccurrenceLocalStart,
} from '@/lib/domain/schedule/occurrence-management';
const url = process.env.CALLBACK_TEST_DATABASE_URL;
if (
  url &&
  (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/callback_test')
)
  throw Error('Disposable callback_test only');
const db = new PrismaClient({
  datasourceUrl: url || 'postgresql://unused:unused@localhost/unused',
});
const prefix = 'upcoming-edit-' + randomUUID();
const now = new Date('2026-11-03T17:00:00Z');
const clock = () => now;
let counter = 0;
async function fixture() {
  const templateId = prefix + ++counter;
  await db.classTemplate.create({
    data: {
      id: templateId,
      slug: templateId,
      name: 'Original name',
      description: 'Synthetic fixture',
      categoryId: prefix,
      durationMinutes: 50,
      defaultCapacity: 20,
      dropInPriceCents: 2500,
      tags: ['preserve'],
      equipment: [],
    },
  });
  const rows: ClassOccurrence[] = [];
  for (const [label, startAt, status, archivedAt] of [
    ['past', '2026-08-01T14:00:00Z', 'SCHEDULED', null],
    ['today', '2026-11-03T23:00:00Z', 'SCHEDULED', null],
    ['future', '2026-11-10T23:00:00Z', 'SCHEDULED', null],
    ['summer', '2027-07-06T22:00:00Z', 'SCHEDULED', null],
    ['cancelled', '2026-11-17T23:00:00Z', 'CANCELLED', null],
    ['archived', '2026-11-24T23:00:00Z', 'CANCELLED', now],
  ] as const)
    rows.push(
      await db.classOccurrence.create({
        data: {
          id: templateId + label,
          templateId,
          startAt: new Date(startAt),
          endAt: new Date(+new Date(startAt) + 3000000),
          capacity: 20,
          priceCents: 2500,
          status,
          archivedAt,
        },
      }),
    );
  const selected = (labels: string[]) =>
    rows
      .filter((r) => labels.some((l) => r.id === templateId + l))
      .map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() }));
  return { templateId, rows, selected };
}
describe.skipIf(!url)(
  'upcoming class edits with real isolated transactions',
  () => {
    beforeAll(async () => {
      await db.user.create({
        data: {
          id: prefix,
          email: prefix + '@example.test',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
      await db.classCategory.create({
        data: { id: prefix, slug: prefix, name: 'Upcoming edit fixture' },
      });
    });
    afterAll(async () => {
      if (url) {
        await db.auditLog.deleteMany({ where: { actorId: prefix } });
        await db.classOccurrence.deleteMany({
          where: { templateId: { startsWith: prefix } },
        });
        await db.classTemplate.deleteMany({
          where: { id: { startsWith: prefix } },
        });
        await db.classCategory.deleteMany({ where: { id: prefix } });
        await db.user.deleteMany({ where: { id: prefix } });
      }
      await db.$disconnect();
    });
    it('renames only selected future dates; preserves exact instants, history, tags and unselected dates', async () => {
      const f = await fixture();
      expect(
        await editUpcomingClasses(
          db,
          {
            actorId: prefix,
            templateId: f.templateId,
            selected: f.selected(['today', 'summer']),
            patch: { titleOverride: ' New name ' },
          },
          clock,
        ),
      ).toBe(2);
      const after = await db.classOccurrence.findMany({
        where: { templateId: f.templateId },
      });
      for (const before of f.rows) {
        const row = after.find((r) => r.id === before.id)!;
        if (['today', 'summer'].some((l) => row.id === f.templateId + l)) {
          expect(row).toEqual({
            ...before,
            titleOverride: 'New name',
            updatedAt: expect.any(Date),
          });
          expect(occurrenceLocalInputValue(row.startAt).slice(-5)).toBe(
            '18:00',
          );
        } else expect(row).toEqual(before);
      }
      const template = await db.classTemplate.findUniqueOrThrow({
        where: { id: f.templateId },
      });
      expect(template.name).toBe('Original name');
      expect(template.tags).toEqual(['preserve']);
      const audit = await db.auditLog.findFirstOrThrow({
        where: { entityId: f.templateId },
      });
      expect(audit.after).toMatchObject({
        ids: f.selected(['today', 'summer']).map((r) => r.id),
        timezone: 'America/New_York',
      });
    });
    it.each(['past', 'cancelled', 'archived'])(
      'rejects a mixed selection containing %s atomically',
      async (label) => {
        const f = await fixture();
        await expect(
          editUpcomingClasses(
            db,
            {
              actorId: prefix,
              templateId: f.templateId,
              selected: f.selected(['today', label]),
              patch: { titleOverride: 'Must not save' },
            },
            clock,
          ),
        ).rejects.toMatchObject({ code: 'past' });
        expect(
          await db.classOccurrence.findUnique({
            where: { id: f.templateId + 'today' },
          }),
        ).toEqual(f.rows.find((r) => r.id.endsWith('today')));
        expect(
          await db.auditLog.count({ where: { entityId: f.templateId } }),
        ).toBe(0);
      },
    );
    it('rejects stale versions and mismatched templates without overwriting another admin', async () => {
      const f = await fixture();
      await db.classOccurrence.update({
        where: { id: f.templateId + 'today' },
        data: {
          publicNotes: 'Other admin edit',
          updatedAt: new Date('2030-01-01'),
        },
      });
      await expect(
        editUpcomingClasses(
          db,
          {
            actorId: prefix,
            templateId: f.templateId,
            selected: f.selected(['today']),
            patch: { titleOverride: 'Must not save' },
          },
          clock,
        ),
      ).rejects.toMatchObject({ code: 'stale' });
      await expect(
        editUpcomingClasses(
          db,
          {
            actorId: prefix,
            templateId: f.templateId + 'wrong',
            selected: f.selected(['future']),
            patch: { titleOverride: 'Must not save' },
          },
          clock,
        ),
      ).rejects.toMatchObject({ code: 'invalid' });
    });
    it('rechecks the clock when saving a class that started while the form was open', async () => {
      const f = await fixture();
      await expect(
        editUpcomingClasses(
          db,
          {
            actorId: prefix,
            templateId: f.templateId,
            selected: f.selected(['today']),
            patch: { titleOverride: 'Late edit' },
          },
          () => new Date('2026-11-03T23:00:00Z'),
        ),
      ).rejects.toMatchObject({ code: 'past' });
    });
    it('validates capacity against booked places and rejects inactive/unassignable instructors', async () => {
      const f = await fixture();
      const row = await db.classOccurrence.update({
        where: { id: f.templateId + 'today' },
        data: { historicalSignupCount: 10 },
      });
      const input = {
        actorId: prefix,
        templateId: f.templateId,
        selected: [{ id: row.id, updatedAt: row.updatedAt.toISOString() }],
      };
      await expect(
        editUpcomingClasses(db, { ...input, patch: { capacity: 9 } }, clock),
      ).rejects.toMatchObject({ code: 'capacity' });
      await expect(
        editUpcomingClasses(
          db,
          { ...input, patch: { instructorId: prefix } },
          clock,
        ),
      ).rejects.toMatchObject({ code: 'instructor' });
      expect(
        await editUpcomingClasses(
          db,
          {
            ...input,
            patch: {
              capacity: 10,
              priceCents: 3000,
              publicNotes: ' Updated notes ',
            },
          },
          clock,
        ),
      ).toBe(1);
      expect(
        await db.classOccurrence.findUniqueOrThrow({ where: { id: row.id } }),
      ).toMatchObject({
        capacity: 10,
        priceCents: 3000,
        publicNotes: 'Updated notes',
        startAt: row.startAt,
        endAt: row.endAt,
        titleOverride: null,
      });
    });
    it('rolls back every selected row on a resulting instructor overlap', async () => {
      const f = await fixture();
      await db.classOccurrence.update({
        where: { id: f.templateId + 'today' },
        data: { instructorId: prefix },
      });
      await db.classOccurrence.create({
        data: {
          id: f.templateId + 'overlap',
          templateId: f.templateId,
          instructorId: prefix,
          startAt: new Date('2026-11-04T00:00:00Z'),
          endAt: new Date('2026-11-04T01:00:00Z'),
          capacity: 20,
        },
      });
      const row = await db.classOccurrence.findUniqueOrThrow({
        where: { id: f.templateId + 'today' },
      });
      await expect(
        editUpcomingClasses(
          db,
          {
            actorId: prefix,
            templateId: f.templateId,
            selected: [
              ...f.selected(['future']),
              { id: row.id, updatedAt: row.updatedAt.toISOString() },
            ],
            patch: { durationMinutes: 90, titleOverride: 'Must roll back' },
          },
          clock,
        ),
      ).rejects.toMatchObject({ code: 'conflict' });
      expect(
        await db.classOccurrence.findUniqueOrThrow({ where: { id: row.id } }),
      ).toEqual(row);
      expect(
        await db.classOccurrence.findUniqueOrThrow({
          where: { id: f.templateId + 'future' },
        }),
      ).toEqual(f.rows.find((r) => r.id.endsWith('future')));
    });
    it('rejects duplicate/no selection and invalid values before starting a write', async () => {
      const f = await fixture();
      const input = {
        actorId: prefix,
        templateId: f.templateId,
        selected: f.selected(['future']),
      };
      for (const patch of [
        {},
        { titleOverride: ' ' },
        { capacity: 0 },
        { durationMinutes: 481 },
        { priceCents: 99 },
      ])
        await expect(
          editUpcomingClasses(db, { ...input, patch }, clock),
        ).rejects.toMatchObject({ code: 'invalid' });
      await expect(
        editUpcomingClasses(
          db,
          {
            ...input,
            selected: [...input.selected, ...input.selected],
            patch: { titleOverride: 'Name' },
          },
          clock,
        ),
      ).rejects.toMatchObject({ code: 'invalid' });
    });
  },
);
describe('New Jersey wall-clock rule', () => {
  it.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo'])(
    'keeps winter and summer NJ times independent of process timezone %s',
    (tz) => {
      const previous = process.env.TZ;
      process.env.TZ = tz;
      try {
        const winter = parseOccurrenceLocalStart('2026-11-03T19:10');
        const summer = parseOccurrenceLocalStart('2027-07-06T19:10');
        expect(winter.toISOString()).toBe('2026-11-04T00:10:00.000Z');
        expect(summer.toISOString()).toBe('2027-07-06T23:10:00.000Z');
        expect(occurrenceLocalInputValue(winter)).toBe('2026-11-03T19:10');
        expect(occurrenceLocalInputValue(summer)).toBe('2027-07-06T19:10');
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    },
  );
});
