import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { assignableInstructorWhere } from '@/lib/admin/assignable-instructors';
import { defaultInstructorPayForOccurrence } from '@/lib/domain/instructors/pay-rates';
import { occurrenceLocalInputValue, parseOccurrenceLocalStart } from '@/lib/domain/schedule/occurrence-management';

const slotSchema = z.object({
  templateId: z.string().min(1), instructorId: z.string().min(1), roomId: z.string().min(1),
  localStart: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(5).max(480), priceCents: z.number().int().min(0).max(100000),
  isEvent: z.boolean(), title: z.string().trim().min(1).max(180),
}).strict();
export const scheduleImportSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), reason: z.string().trim().min(10).max(1000),
  dryRun: z.boolean(), slots: z.array(slotSchema).min(1).max(150),
}).strict();
export type ScheduleImportInput = z.infer<typeof scheduleImportSchema>;
type Interval = { startAt: Date; endAt: Date; instructorId: string | null; roomId: string | null };
export function scheduleSlotsConflict(a: Interval, b: Interval) {
  return a.startAt < b.endAt && a.endAt > b.startAt &&
    ((a.roomId && a.roomId === b.roomId) || (a.instructorId && a.instructorId === b.instructorId)) ? true : false;
}
export function prepareScheduleImport(raw: ScheduleImportInput) {
  const input = scheduleImportSchema.parse(raw);
  const rows = input.slots.map(slot => {
    const startAt = parseOccurrenceLocalStart(slot.localStart);
    if (!Number.isFinite(startAt.getTime()) || occurrenceLocalInputValue(startAt) !== slot.localStart || !slot.localStart.startsWith(input.month + '-'))
      throw new Error('Each date must be a real Eastern local time in the selected month.');
    const id = 'schedule-import-' + createHash('sha256').update(`${slot.templateId}|${slot.localStart}`).digest('hex').slice(0, 28);
    return { ...slot, id, startAt, endAt: new Date(startAt.getTime() + slot.durationMinutes * 60000) };
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate schedule entries.');
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++)
    if (scheduleSlotsConflict(rows[i], rows[j])) throw new Error(`Schedule conflict: ${rows[i].localStart} / ${rows[j].localStart}`);
  return rows;
}

/** All-or-nothing, repeatable insert. Never edits or removes existing occurrences. */
export async function importSchedule(db: PrismaClient, raw: ScheduleImportInput, actorId: string) {
  const input = scheduleImportSchema.parse(raw);
  const rows = prepareScheduleImport(input);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rhyze-schedule-import'))`;
    const templates = await tx.classTemplate.findMany({ where: { id: { in: rows.map(r => r.templateId) }, isActive: true } });
    const instructors = await tx.user.findMany({ where: { id: { in: rows.map(r => r.instructorId) }, ...assignableInstructorWhere }, include: { instructorProfile: true } });
    const rooms = await tx.room.findMany({ where: { id: { in: rows.map(r => r.roomId) }, isActive: true } });
    const existing = await tx.classOccurrence.findMany({ where: { OR: [
      { id: { in: rows.map(r => r.id) } },
      { startAt: { lt: new Date(Math.max(...rows.map(r => r.endAt.getTime()))) }, endAt: { gt: new Date(Math.min(...rows.map(r => r.startAt.getTime()))) } },
    ] } });
    const pending = [];
    let unchanged = 0;
    for (const row of rows) {
      const template = templates.find(t => t.id === row.templateId);
      const instructor = instructors.find(i => i.id === row.instructorId);
      const room = rooms.find(r => r.id === row.roomId);
      if (!template || !instructor || !room) throw new Error(`Inactive/missing catalog, instructor or room at ${row.localStart}.`);
      if (template.isEvent !== row.isEvent) throw new Error(`Class/event classification mismatch at ${row.localStart}.`);
      const same = existing.find(e => e.id === row.id);
      if (same) {
        if (same.status !== 'SCHEDULED' || same.templateId !== row.templateId || same.instructorId !== row.instructorId || same.roomId !== row.roomId || same.startAt.getTime() !== row.startAt.getTime() || same.endAt.getTime() !== row.endAt.getTime() || same.priceCents !== row.priceCents || same.titleOverride !== row.title)
          throw new Error(`Existing imported occurrence changed; review it manually: ${row.id}`);
        unchanged++; continue;
      }
      if (existing.some(e => e.status === 'SCHEDULED' && (scheduleSlotsConflict(e, row) || (e.templateId === row.templateId && e.startAt.getTime() === row.startAt.getTime()))))
        throw new Error(`Existing schedule conflict at ${row.localStart}.`);
      const pay = defaultInstructorPayForOccurrence({ isEvent: template.isEvent, standardClassRateCents: instructor.instructorProfile?.standardClassRateCents, specialtyEventRateCents: instructor.instructorProfile?.specialtyEventRateCents });
      pending.push({ id: row.id, templateId: row.templateId, instructorId: row.instructorId, roomId: row.roomId, startAt: row.startAt, endAt: row.endAt, timezone: 'America/New_York', capacity: Math.min(template.defaultCapacity, room.capacity ?? template.defaultCapacity), priceCents: row.priceCents, titleOverride: row.title, instructorPayMethod: pay.method, instructorPayCents: pay.cents });
    }
    if (!input.dryRun && pending.length) {
      await tx.classOccurrence.createMany({ data: pending });
      await tx.auditLog.createMany({ data: pending.map(row => ({ actorId, action: 'class-occurrence.imported', entityType: 'ClassOccurrence', entityId: row.id, after: { reason: input.reason, month: input.month, localStart: occurrenceLocalInputValue(row.startAt), priceCents: row.priceCents, instructorId: row.instructorId } })) });
    }
    return { dryRun: input.dryRun, created: input.dryRun ? 0 : pending.length, wouldCreate: pending.length, unchanged, occurrenceIds: rows.map(r => r.id) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
