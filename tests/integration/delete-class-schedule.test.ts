import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
vi.mock('server-only', () => ({}));
import * as removal from '@/lib/domain/schedule/delete-occurrence';
const url = process.env.CALLBACK_TEST_DATABASE_URL;
if (
  url &&
  (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/callback_test')
)
  throw Error('Isolated DB only');
const db = new PrismaClient({
  datasourceUrl: url || 'postgresql://unused:unused@localhost/unused',
});
const prefix = 'delete-scope-' + randomUUID();
const remove = (input: any) =>
  (removal as any).deleteClassSchedule(db, prefix, input);
let index = 0;
async function fixture() {
  const id = prefix + ++index;
  await db.classTemplate.create({
    data: {
      id,
      slug: id,
      name: 'Monthly class',
      description: 'Test only',
      categoryId: prefix,
      durationMinutes: 50,
      defaultCapacity: 20,
    },
  });
  const series = await db.classSeries.create({
    data: {
      templateId: id,
      recurrenceRule: 'FREQ=WEEKLY',
      startsAt: new Date(Date.now() + 86400000),
    },
  });
  const rows = [];
  for (const offset of [-2, 2, 9])
    rows.push(
      await db.classOccurrence.create({
        data: {
          templateId: id,
          seriesId: series.id,
          startAt: new Date(Date.now() + offset * 86400000),
          endAt: new Date(Date.now() + offset * 86400000 + 3000000),
          capacity: 20,
        },
      }),
    );
  const dates = rows
    .slice(1)
    .map((r) => ({
      id: r.id,
      expectedStartAt: r.startAt.toISOString(),
      expectedUpdatedAt: r.updatedAt.toISOString(),
      booked: 0,
      waiting: 0,
    }));
  return { id, rows, series, dates };
}
describe.skipIf(!url)('delete one or all future class dates atomically', () => {
  beforeAll(async () => {
    await db.user.create({
      data: { id: prefix, email: prefix + '@example.test', role: 'OWNER' },
    });
    await db.classCategory.create({
      data: { id: prefix, slug: prefix, name: 'Test' },
    });
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  it('deletes one selected date without touching another date, past history or recurrence', async () => {
    const f = await fixture();
    await remove({
      templateId: f.id,
      scope: 'one',
      dates: [f.dates[0]],
      confirmed: true,
    });
    expect(
      await db.classOccurrence.findUnique({ where: { id: f.rows[1].id } }),
    ).toMatchObject({ archivedAt: expect.any(Date) });
    for (const row of [f.rows[0], f.rows[2]])
      expect(
        await db.classOccurrence.findUnique({ where: { id: row.id } }),
      ).toEqual(row);
    expect(
      await db.classSeries.findUnique({ where: { id: f.series.id } }),
    ).toMatchObject({ isActive: true });
  });
  it('removes all future dates, preserves history and another format, pauses recurrence, and is safe to repeat', async () => {
    const f = await fixture(),
      other = await fixture();
    const input = {
      templateId: f.id,
      scope: 'future',
      dates: f.dates,
      confirmed: true,
    };
    await remove(input);
    await remove(input);
    expect(
      await db.classOccurrence.count({
        where: { templateId: f.id, archivedAt: { not: null } },
      }),
    ).toBe(2);
    expect(
      await db.classOccurrence.findUnique({ where: { id: f.rows[0].id } }),
    ).toEqual(f.rows[0]);
    expect(
      await db.classOccurrence.count({
        where: { templateId: other.id, archivedAt: null },
      }),
    ).toBe(3);
    expect(
      await db.classSeries.findUnique({ where: { id: f.series.id } }),
    ).toMatchObject({ isActive: false });
    expect(
      await db.auditLog.count({
        where: {
          entityId: { in: f.dates.map((d) => d.id) },
          action: 'class-occurrence.deleted-from-schedule',
        },
      }),
    ).toBe(2);
    expect(
      await db.emailMessage.count({
        where: {
          dedupeKey: {
            in: f.dates.map((d) => 'class-deleted:' + d.id + ':' + prefix),
          },
        },
      }),
    ).toBe(0);
  });
  it('refuses changed dates, newly added dates, cross-template selection and missing confirmation', async () => {
    const f = await fixture(),
      other = await fixture();
    for (const input of [
      {
        templateId: f.id,
        scope: 'future',
        dates: [f.dates[0]],
        confirmed: true,
      },
      {
        templateId: f.id,
        scope: 'one',
        dates: [other.dates[0]],
        confirmed: true,
      },
      {
        templateId: f.id,
        scope: 'one',
        dates: [{ ...f.dates[0], expectedUpdatedAt: 'stale' }],
        confirmed: true,
      },
      { templateId: f.id, scope: 'one', dates: [f.dates[0]], confirmed: false },
    ])
      await expect(remove(input)).rejects.toThrow();
    expect(
      await db.classOccurrence.count({
        where: { templateId: f.id, archivedAt: null },
      }),
    ).toBe(3);
  });
  it('rolls back every date and its credit/email effects if a later date is blocked by an unresolved payment', async () => {
    const f = await fixture();
    const booking=await db.booking.create({data:{userId:prefix,occurrenceId:f.rows[1].id}});
    const credit=await db.creditAccount.create({data:{userId:prefix,label:'Original class credit',validFrom:new Date(),entries:{create:[{type:'GRANT',quantity:1},{type:'RESERVE',quantity:-1,bookingId:booking.id}]}}});
    f.dates[0].booked=1;
    await db.commerceOrder.create({
      data: {
        userId: prefix,
        occurrenceId: f.rows[2].id,
        kind: 'EVENT',
        status: 'PENDING',
        amountCents: 3000,
      },
    });
    await expect(
      remove({
        templateId: f.id,
        scope: 'future',
        dates: f.dates,
        confirmed: true,
      }),
    ).rejects.toThrow('delete-payment');
    expect(
      await db.classOccurrence.count({
        where: { templateId: f.id, archivedAt: null },
      }),
    ).toBe(3);
    expect(
      await db.classSeries.findUnique({ where: { id: f.series.id } }),
    ).toMatchObject({ isActive: true });
    expect(await db.booking.findUnique({where:{id:booking.id}})).toMatchObject({status:'CONFIRMED'});
    expect(await db.creditLedgerEntry.count({where:{creditAccountId:credit.id,type:'RELEASE'}})).toBe(0);
    expect(await db.emailMessage.count({where:{dedupeKey:`class-deleted:${f.rows[1].id}:${prefix}`}})).toBe(0);
  });
  it('rechecks signups and refuses a stale empty-roster preview', async () => {
    const f = await fixture();
    await db.booking.create({
      data: { userId: prefix, occurrenceId: f.rows[1].id },
    });
    await expect(
      remove({
        templateId: f.id,
        scope: 'one',
        dates: [f.dates[0]],
        confirmed: true,
      }),
    ).rejects.toThrow('delete-stale');
    expect(
      await db.classOccurrence.findUnique({ where: { id: f.rows[1].id } }),
    ).toMatchObject({ archivedAt: null });
  });
});
