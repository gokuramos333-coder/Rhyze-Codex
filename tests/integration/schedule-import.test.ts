import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importSchedule, type ScheduleImportInput } from '@/lib/admin/schedule-import';

const url = process.env.CALLBACK_TEST_DATABASE_URL;
if (url && (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname) || new URL(url).pathname !== '/callback_test')) throw new Error('Explicit disposable callback_test database required.');
describe.skipIf(!url)('atomic schedule publication', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const prefix = 'calendar-' + randomUUID();
  const ids = { owner: prefix + '-owner', teacher: prefix + '-teacher', location: prefix + '-location', room: prefix + '-room', category: prefix + '-category', template: prefix + '-template' };
  const slot = { templateId: ids.template, instructorId: ids.teacher, roomId: ids.room, localStart: '2026-10-16T19:30', durationMinutes: 50, priceCents: 1500, isEvent: false, title: 'Synthetic class' };
  const input: ScheduleImportInput = { month: '2026-10', reason: 'Synthetic approved schedule import', dryRun: false, slots: [slot] };
  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ids.owner, email: ids.owner + '@example.test', role: 'OWNER', status: 'ACTIVE' }, { id: ids.teacher, email: ids.teacher + '@example.test', role: 'INSTRUCTOR', status: 'ACTIVE', passwordHash: 'test-only' }] });
    await db.instructorProfile.create({ data: { userId: ids.teacher, isActive: true, standardClassRateCents: 4000 } });
    await db.location.create({ data: { id: ids.location, name: prefix } });
    await db.room.create({ data: { id: ids.room, locationId: ids.location, name: 'Synthetic room', capacity: 20 } });
    await db.classCategory.create({ data: { id: ids.category, name: prefix, slug: prefix } });
    await db.classTemplate.create({ data: { id: ids.template, categoryId: ids.category, name: 'Synthetic class', slug: prefix, description: 'Integration fixture', durationMinutes: 50, defaultCapacity: 25, dropInPriceCents: 2500, isEvent: false, tags: [], equipment: [] } });
  });
  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { actorId: ids.owner } });
    await db.classOccurrence.deleteMany({ where: { templateId: ids.template } });
    await db.classTemplate.delete({ where: { id: ids.template } });
    await db.classCategory.delete({ where: { id: ids.category } });
    await db.room.delete({ where: { id: ids.room } });
    await db.location.delete({ where: { id: ids.location } });
    await db.instructorProfile.deleteMany({ where: { userId: ids.teacher } });
    await db.user.deleteMany({ where: { id: { in: [ids.owner, ids.teacher] } } });
    await db.$disconnect();
  });
  it('previews without writes, publishes once with audit and preserves price overrides', async () => {
    expect(await importSchedule(db, { ...input, dryRun: true }, ids.owner)).toMatchObject({ wouldCreate: 1, created: 0 });
    expect(await db.classOccurrence.count({ where: { templateId: ids.template } })).toBe(0);
    expect(await importSchedule(db, input, ids.owner)).toMatchObject({ created: 1, unchanged: 0 });
    expect(await importSchedule(db, input, ids.owner)).toMatchObject({ created: 0, unchanged: 1 });
    expect(await db.classOccurrence.findFirst({ where: { templateId: ids.template } })).toMatchObject({ priceCents: 1500, capacity: 20, instructorPayCents: 4000, startAt: new Date('2026-10-16T23:30:00Z') });
    expect(await db.auditLog.count({ where: { actorId: ids.owner } })).toBe(1);
  });
  it('rolls back a whole batch on conflicting catalog classification', async () => {
    const slots = [{ ...slot, localStart: '2026-10-17T19:30' }, { ...slot, localStart: '2026-10-18T19:30', isEvent: true }];
    await expect(importSchedule(db, { ...input, slots }, ids.owner)).rejects.toThrow('classification');
    expect(await db.classOccurrence.count({ where: { templateId: ids.template } })).toBe(1);
  });
  it('blocks existing overlap and refuses to overwrite an edited imported row', async () => {
    await expect(importSchedule(db, { ...input, slots: [{ ...slot, localStart: '2026-10-16T19:40' }] }, ids.owner)).rejects.toThrow('conflict');
    await expect(importSchedule(db, { ...input, slots: [{ ...slot, priceCents: 3000 }] }, ids.owner)).rejects.toThrow('changed');
    expect(await db.classOccurrence.count({ where: { templateId: ids.template } })).toBe(1);
  });
});
