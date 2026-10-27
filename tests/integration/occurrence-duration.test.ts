import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const actor = vi.hoisted(() => ({ id: '' }));
vi.mock('@/lib/auth/session', () => ({ requireArea: async () => actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(url); } }));
vi.mock('@/lib/db/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  const url = process.env.CALLBACK_TEST_DATABASE_URL;
  if (url && (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname) || new URL(url).pathname !== '/callback_test')) throw new Error('Explicit disposable callback_test required');
  return { prisma: new PrismaClient({ datasourceUrl: url }) };
});
import { prisma as db } from '@/lib/db/prisma';
import { updateOccurrenceAction } from '@/app/(studio)/admin/schedule/[occurrenceId]/actions';

const url = process.env.CALLBACK_TEST_DATABASE_URL;
describe.skipIf(!url)('occurrence duration edit on PostgreSQL', () => {
  const prefix = 'duration-' + randomUUID();
  const ids = { owner: prefix + '-owner', teacher: prefix + '-teacher', location: prefix + '-location', room: prefix + '-room', category: prefix + '-category', template: prefix + '-template', target: prefix + '-target', other: prefix + '-other', history: prefix + '-history' };
  const startAt = new Date('2026-11-01T15:00:00Z');
  const endAt = new Date('2026-11-01T15:30:00Z');
  function form() {
    const data = new FormData();
    Object.entries({ id: ids.target, startAt: '2026-11-01T10:00', durationMinutes: '50', dropInPrice: '20', instructorId: ids.teacher, capacity: '25', instructorPayMethod: 'STANDARD_CLASS_RATE', instructorPayAmount: '40' }).forEach(([key, value]) => data.set(key, value));
    return data;
  }
  beforeAll(async () => {
    actor.id = ids.owner;
    await db.user.createMany({ data: [{ id: ids.owner, email: ids.owner + '@example.test', role: 'OWNER', status: 'ACTIVE' }, { id: ids.teacher, email: ids.teacher + '@example.test', role: 'INSTRUCTOR', status: 'ACTIVE', passwordHash: 'test-only' }] });
    await db.instructorProfile.create({ data: { userId: ids.teacher, isActive: true, standardClassRateCents: 4000 } });
    await db.location.create({ data: { id: ids.location, name: prefix } });
    await db.room.create({ data: { id: ids.room, locationId: ids.location, name: prefix, capacity: 25 } });
    await db.classCategory.create({ data: { id: ids.category, name: prefix, slug: prefix } });
    await db.classTemplate.create({ data: { id: ids.template, categoryId: ids.category, name: 'Synthetic POUND', slug: prefix, description: 'Test', durationMinutes: 30, defaultCapacity: 25, dropInPriceCents: 1500, tags: [], equipment: [] } });
    await db.classOccurrence.createMany({ data: [
      { id: ids.target, templateId: ids.template, instructorId: ids.teacher, roomId: ids.room, startAt, endAt, capacity: 25, priceCents: 1500, instructorPayCents: 4000 },
      { id: ids.other, templateId: ids.template, instructorId: ids.teacher, roomId: ids.room, startAt: new Date('2026-11-08T15:00:00Z'), endAt: new Date('2026-11-08T15:30:00Z'), capacity: 25, priceCents: 1500 },
      { id: ids.history, templateId: ids.template, instructorId: ids.teacher, roomId: ids.room, startAt: new Date('2026-10-04T14:00:00Z'), endAt: new Date('2026-10-04T14:30:00Z'), capacity: 25, priceCents: 1500 },
    ] });
  });
  beforeEach(async () => {
    await db.auditLog.deleteMany({ where: { actorId: ids.owner } });
    await db.classOccurrence.update({ where: { id: ids.target }, data: { startAt, endAt, priceCents: 1500 } });
    await db.classOccurrence.update({ where: { id: ids.other }, data: { startAt: new Date('2026-11-08T15:00:00Z'), endAt: new Date('2026-11-08T15:30:00Z'), instructorId: ids.teacher, roomId: ids.room, status: 'SCHEDULED' } });
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
  it('persists an audited occurrence-only change and preserves template, sibling and history', async () => {
    const template = await db.classTemplate.findUniqueOrThrow({ where: { id: ids.template } });
    const unaffected = await db.classOccurrence.findMany({ where: { id: { in: [ids.other, ids.history] } }, orderBy: { id: 'asc' } });
    await expect(updateOccurrenceAction(form())).rejects.toThrow('?saved=1');
    expect(await db.classOccurrence.findUniqueOrThrow({ where: { id: ids.target } })).toMatchObject({ startAt, endAt: new Date('2026-11-01T15:50:00Z'), priceCents: 2000, capacity: 25, roomId: ids.room, instructorId: ids.teacher, instructorPayCents: 4000 });
    expect(await db.classTemplate.findUniqueOrThrow({ where: { id: ids.template } })).toEqual(template);
    expect(await db.classOccurrence.findMany({ where: { id: { in: [ids.other, ids.history] } }, orderBy: { id: 'asc' } })).toEqual(unaffected);
    const audit = await db.auditLog.findMany({ where: { actorId: ids.owner } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entityId: ids.target, action: 'class-occurrence.updated.by-admin', before: { endAt: endAt.toISOString(), priceCents: 1500 }, after: { endAt: '2026-11-01T15:50:00.000Z', priceCents: 2000 } });
    const legacyForm = form(); legacyForm.delete('durationMinutes');
    await expect(updateOccurrenceAction(legacyForm)).rejects.toThrow('?saved=1');
    expect((await db.classOccurrence.findUniqueOrThrow({ where: { id: ids.target } })).endAt.toISOString()).toBe('2026-11-01T15:50:00.000Z');
  });
  it.each(['room', 'instructor'] as const)('rolls back extension overlapping only the same %s', async resource => {
    await db.classOccurrence.update({ where: { id: ids.other }, data: { startAt: new Date('2026-11-01T15:40:00Z'), endAt: new Date('2026-11-01T16:30:00Z'), ...(resource === 'room' ? { instructorId: null } : { roomId: null }) } });
    await expect(updateOccurrenceAction(form())).rejects.toThrow('?error=conflict');
    expect(await db.classOccurrence.findUniqueOrThrow({ where: { id: ids.target } })).toMatchObject({ endAt, priceCents: 1500 });
    expect(await db.auditLog.count({ where: { actorId: ids.owner } })).toBe(0);
  });
  it.each(['CANCELLED', 'COMPLETED'] as const)('ignores %s neighbors', async status => {
    await db.classOccurrence.update({ where: { id: ids.other }, data: { startAt, endAt, status } });
    await expect(updateOccurrenceAction(form())).rejects.toThrow('?saved=1');
  });
  it('fails closed when concurrent edits try to occupy the same new interval', async () => {
    const first = form(); first.set('startAt', '2026-11-01T12:00');
    const second = form(); second.set('id', ids.other); second.set('startAt', '2026-11-01T12:00');
    const results = await Promise.allSettled([updateOccurrenceAction(first), updateOccurrenceAction(second)]);
    const saved = results.filter(result => result.status === 'rejected' && String(result.reason).includes('?saved=1'));
    expect(saved).toHaveLength(1);
    expect(await db.classOccurrence.count({ where: { templateId: ids.template, startAt: new Date('2026-11-01T17:00:00Z') } })).toBe(1);
    expect(await db.auditLog.count({ where: { actorId: ids.owner } })).toBe(1);
  });
  it('allows an exactly adjacent scheduled class', async () => {
    await db.classOccurrence.update({ where: { id: ids.other }, data: { startAt: new Date('2026-11-01T15:50:00Z'), endAt: new Date('2026-11-01T16:30:00Z') } });
    await expect(updateOccurrenceAction(form())).rejects.toThrow('?saved=1');
  });
});
