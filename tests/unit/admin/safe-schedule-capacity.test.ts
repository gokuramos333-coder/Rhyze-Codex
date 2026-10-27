import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { importSchedule, prepareScheduleImport, scheduleImportSchema } from '@/lib/admin/schedule-import';
const slot = { templateId: 'template', instructorId: 'teacher', roomId: 'room', localStart: '2026-11-13T19:30', durationMinutes: 75, priceCents: 3000, isEvent: true, title: 'Seat Seduction with Vanessa', capacity: 16 };
const input = { month: '2026-11', reason: 'Owner approved sixteen seats for November only', dryRun: false, slots: [slot] };
function fixture(existing: unknown[] = []) {
  const tx = { $executeRaw: vi.fn(), classTemplate: { findMany: vi.fn().mockResolvedValue([{ id: 'template', isEvent: true, defaultCapacity: 25 }]) }, user: { findMany: vi.fn().mockResolvedValue([{ id: 'teacher', instructorProfile: null }]) }, room: { findMany: vi.fn().mockResolvedValue([{ id: 'room', capacity: 25 }]) }, classOccurrence: { findMany: vi.fn().mockResolvedValue(existing), createMany: vi.fn() }, auditLog: { createMany: vi.fn() } };
  const db = { $transaction: (f: (t: typeof tx) => unknown) => f(tx) } as unknown as PrismaClient;
  return { db, tx };
}
describe('safe explicit schedule capacity', () => {
  it('accepts explicit integer capacity and preserves stable occurrence identity', () => {
    expect(scheduleImportSchema.safeParse(input).success).toBe(true);
    const { capacity: _, ...defaultSlot } = slot;
    expect(prepareScheduleImport(input)[0].id).toBe(prepareScheduleImport({ ...input, slots: [defaultSlot] })[0].id);
    for (const capacity of [0, -1, 1.5, 1001]) expect(scheduleImportSchema.safeParse({ ...input, slots: [{ ...slot, capacity }] }).success).toBe(false);
  });
  it('persists and audits the approved occurrence-only capacity', async () => {
    const { db, tx } = fixture();
    expect((await importSchedule(db, input, 'owner')).created).toBe(1);
    expect(tx.classOccurrence.createMany.mock.calls[0][0].data[0].capacity).toBe(16);
    expect(tx.auditLog.createMany.mock.calls[0][0].data[0].after.capacity).toBe(16);
  });
  it('rejects exceeding the room bound rather than silently clamping', async () => {
    const { db, tx } = fixture();
    await expect(importSchedule(db, { ...input, slots: [{ ...slot, capacity: 30 }] }, 'owner')).rejects.toThrow(/capacity/i);
    expect(tx.classOccurrence.createMany).not.toHaveBeenCalled();
  });
  it('dry-runs without inserting any rows', async () => {
    const { db, tx } = fixture();
    expect(await importSchedule(db, { ...input, dryRun: true }, 'owner')).toMatchObject({ created: 0, wouldCreate: 1 });
    expect(tx.classOccurrence.createMany).not.toHaveBeenCalled();
    expect(tx.auditLog.createMany).not.toHaveBeenCalled();
  });
  it('refuses replay when an explicit capacity differs from the existing occurrence', async () => {
    const prepared = prepareScheduleImport(input)[0];
    const { db } = fixture([{ ...prepared, status: 'SCHEDULED', titleOverride: slot.title, capacity: 25 }]);
    await expect(importSchedule(db, input, 'owner')).rejects.toThrow(/changed/);
  });
  it('retains legacy default capacity when the field is absent', async () => {
    const { capacity: _, ...defaultSlot } = slot;
    const { db, tx } = fixture();
    await importSchedule(db, { ...input, slots: [defaultSlot] }, 'owner');
    expect(tx.classOccurrence.createMany.mock.calls[0][0].data[0].capacity).toBe(25);
  });
});
