import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { importSchedule, prepareScheduleImport, scheduleImportSchema } from '@/lib/admin/schedule-import';
const slot = { templateId: 'ritmo', instructorId: 'melissa', roomId: 'room', localStart: '2026-11-02T18:10', durationMinutes: 50, priceCents: 2500, isEvent: false, title: 'Zumba', substituteInstructorName: 'Vincent' };
const input = { month: '2026-11', reason: 'Owner approved one-time substitute', dryRun: false, slots: [slot] };
function fixture(existing: unknown[] = []) {
  const tx = { $executeRaw: vi.fn(), classTemplate: { findMany: vi.fn().mockResolvedValue([{ id: 'ritmo', isEvent: false, defaultCapacity: 25 }]) }, user: { findMany: vi.fn().mockResolvedValue([{ id: 'melissa', instructorProfile: null }]) }, room: { findMany: vi.fn().mockResolvedValue([{ id: 'room', capacity: 25 }]) }, classOccurrence: { findMany: vi.fn().mockResolvedValue(existing), createMany: vi.fn() }, auditLog: { createMany: vi.fn() } };
  return { tx, db: { $transaction: (f: (t: typeof tx) => unknown) => f(tx) } as unknown as PrismaClient };
}
describe('one-time named schedule substitute', () => {
  it('accepts a trimmed optional name with stable identity', () => {
    expect(scheduleImportSchema.safeParse(input).success).toBe(true);
    const { substituteInstructorName: _, ...ordinary } = slot;
    expect(prepareScheduleImport(input)[0].id).toBe(prepareScheduleImport({ ...input, slots: [ordinary] })[0].id);
    expect(scheduleImportSchema.parse({ ...input, slots: [{ ...slot, substituteInstructorName: ' Vincent ' }] }).slots[0]).toHaveProperty('substituteInstructorName', 'Vincent');
  });
  it.each(['', '   ', 'x'.repeat(181), null, 123])('rejects invalid names %s', name => {
    expect(scheduleImportSchema.safeParse({ ...input, slots: [{ ...slot, substituteInstructorName: name }] }).success).toBe(false);
  });
  it('does not accept a guessed alternative field or isSubstitute flag', () => {
    expect(scheduleImportSchema.safeParse({ ...input, slots: [{ ...slot, displayInstructorName: 'Vincent' }] }).success).toBe(false);
    expect(scheduleImportSchema.safeParse({ ...input, slots: [{ ...slot, isSubstitute: false }] }).success).toBe(false);
  });
  it('creates and audits explicit display while retaining canonical Melissa', async () => {
    const { db, tx } = fixture();
    expect(await importSchedule(db, input, 'owner')).toMatchObject({ created: 1 });
    expect(tx.classOccurrence.createMany.mock.calls[0][0].data[0]).toMatchObject({ instructorId: 'melissa', substituteInstructorName: 'Vincent', isSubstitute: true });
    expect(tx.auditLog.createMany.mock.calls[0][0].data[0].after).toMatchObject({ instructorId: 'melissa', substituteInstructorName: 'Vincent', isSubstitute: true });
  });
  it('dry runs without writes', async () => {
    const { db, tx } = fixture();
    expect(await importSchedule(db, { ...input, dryRun: true }, 'owner')).toMatchObject({ created: 0, wouldCreate: 1 });
    expect(tx.classOccurrence.createMany).not.toHaveBeenCalled(); expect(tx.auditLog.createMany).not.toHaveBeenCalled();
  });
  it('replays identically but rejects changed, cleared or unflagged substitute', async () => {
    const existing = { ...prepareScheduleImport(input)[0], titleOverride: 'Zumba', status: 'SCHEDULED', isSubstitute: true };
    expect(await importSchedule(fixture([existing]).db, input, 'owner')).toMatchObject({ unchanged: 1 });
    for (const changed of [{ substituteInstructorName: 'Other' }, { substituteInstructorName: null }, { isSubstitute: false }]) {
      await expect(importSchedule(fixture([{ ...existing, ...changed }]).db, input, 'owner')).rejects.toThrow(/changed/);
    }
    const { substituteInstructorName: _, ...ordinary } = slot;
    await expect(importSchedule(fixture([existing]).db, { ...input, slots: [ordinary] }, 'owner')).rejects.toThrow(/changed/);
  });
  it('refuses a parallel existing Ritmo slot instead of making a second roster', async () => {
    const existing = { ...prepareScheduleImport(input)[0], id: 'old-ritmo', status: 'SCHEDULED' };
    await expect(importSchedule(fixture([existing]).db, input, 'owner')).rejects.toThrow(/conflict/);
  });
});
