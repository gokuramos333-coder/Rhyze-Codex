import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  const url = process.env.CALLBACK_TEST_DATABASE_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/callback_test') throw Error('Disposable callback_test only');
  return { prisma: new PrismaClient({ datasourceUrl: url }) };
});
import { prisma } from '@/lib/db/prisma';
import { loadPublicScheduleSlots } from '@/lib/domain/schedule/public-schedule-query';
const prefix = 'calendar-history-' + randomUUID();
const now = new Date();
const past = new Date(+now - 86400000), future = new Date(+now + 86400000);
describe.skipIf(!process.env.CALLBACK_TEST_DATABASE_URL)('stored public schedule history', () => {
  beforeAll(async () => {
    await prisma.classCategory.create({ data: { id: prefix, slug: prefix, name: 'History test' } });
    for (const active of [true, false]) {
      const templateId = prefix + active;
      await prisma.classTemplate.create({ data: { id: templateId, slug: templateId, name: 'History test class', description: 'Synthetic fixture', categoryId: prefix, durationMinutes: 50, defaultCapacity: 20, isActive: active, tags: [], equipment: [] } });
      for (const [label, startAt, status, archivedAt] of [
        ['past', past, 'SCHEDULED', null], ['completed', past, 'COMPLETED', null], ['future', future, 'SCHEDULED', null], ['cancelled', past, 'CANCELLED', null], ['deleted', past, 'CANCELLED', now],
      ] as const) await prisma.classOccurrence.create({ data: { id: templateId + label, templateId, startAt, endAt: new Date(+startAt + 3000000), capacity: 20, status, archivedAt } });
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });
  it('includes actual past dates, including completed/inactive formats; excludes cancelled/deleted and inactive future dates', async () => {
    const slots = await loadPublicScheduleSlots(undefined, { categorySlug: prefix });
    expect(slots.map(s => s.id).sort()).toEqual(['truepast', 'truecompleted', 'truefuture', 'falsepast', 'falsecompleted'].map(s => prefix + s).sort());
    expect(slots.filter(s => s.isPast)).toHaveLength(4);
    expect(slots.find(s => s.id.endsWith('truefuture'))?.isPast).toBe(false);
  });
});
