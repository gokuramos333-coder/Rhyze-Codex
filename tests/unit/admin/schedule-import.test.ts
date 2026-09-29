import { describe, expect, it } from 'vitest';
import { prepareScheduleImport, scheduleImportSchema, scheduleSlotsConflict } from '@/lib/admin/schedule-import';

const slot = { templateId: 'template', instructorId: 'teacher', roomId: 'room', localStart: '2026-10-16T19:30', durationMinutes: 50, priceCents: 1500, isEvent: false, title: 'Soul Line Dancing with Rachel' };
const input = { month: '2026-10', reason: 'Owner supplied October calendar', dryRun: true, slots: [slot] };
describe('audited schedule import validation', () => {
  it('uses Eastern time and stable identities across retries', () => {
    const first = prepareScheduleImport(input)[0];
    expect(first.startAt.toISOString()).toBe('2026-10-16T23:30:00.000Z');
    expect(first.endAt.toISOString()).toBe('2026-10-17T00:20:00.000Z');
    expect(first.id).toBe(prepareScheduleImport({ ...input, dryRun: false })[0].id);
  });
  it('rejects normalized invalid dates, missing times, and wrong months', () => {
    for (const localStart of ['2026-10-32T19:30', '2026-10-16', '2026-11-16T19:30'])
      expect(() => prepareScheduleImport({ ...input, slots: [{ ...slot, localStart }] })).toThrow();
  });
  it('rejects duplicate entries and overlapping room or instructor bookings', () => {
    expect(() => prepareScheduleImport({ ...input, slots: [slot, slot] })).toThrow();
    const a = prepareScheduleImport(input)[0];
    const b = { ...a, id: 'other', instructorId: 'other', startAt: new Date(a.startAt.getTime() + 40 * 60000) };
    expect(scheduleSlotsConflict(a, b)).toBe(true);
    expect(scheduleSlotsConflict(a, { ...b, roomId: 'other-room' })).toBe(false);
    expect(scheduleSlotsConflict(a, { ...b, startAt: a.endAt })).toBe(false);
  });
  it('requires explicit event classification, integer cents and refuses forged actor IDs', () => {
    expect(scheduleImportSchema.safeParse({ ...input, actorId: 'other' }).success).toBe(false);
    expect(scheduleImportSchema.safeParse({ ...input, slots: [{ ...slot, priceCents: 15.5 }] }).success).toBe(false);
    expect(scheduleImportSchema.safeParse({ ...input, slots: [{ ...slot, isEvent: undefined }] }).success).toBe(false);
  });
});
