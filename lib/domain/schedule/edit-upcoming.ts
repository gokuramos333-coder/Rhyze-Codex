import { randomUUID } from 'node:crypto';
import {
  occurrenceLocalInputValue,
  parseOccurrenceLocalStart,
} from './occurrence-management';
import { Prisma, type PrismaClient } from '@prisma/client';
import { confirmedRosterBookingWhere } from '@/lib/domain/bookings/known-cancellations';
import { assignableInstructorWhere } from '@/lib/admin/assignable-instructors';
export type UpcomingClassPatch = {
  titleOverride?: string;
  capacity?: number;
  priceCents?: number;
  durationMinutes?: number;
  instructorId?: string;
  publicNotes?: string | null;
  imageUrl?: string | null;
};
export class UpcomingClassEditError extends Error {
  constructor(
    public code:
      | 'invalid'
      | 'past'
      | 'stale'
      | 'capacity'
      | 'conflict'
      | 'instructor',
  ) {
    super(code);
  }
}
export function strictStudioStart(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new UpcomingClassEditError('invalid');
  const result = parseOccurrenceLocalStart(value);
  // Reject invalid dates, spring-forward gaps and ambiguous fall-back hours.
  if (
    occurrenceLocalInputValue(result) !== value ||
    [-3600000, 3600000].some(
      (delta) => occurrenceLocalInputValue(new Date(+result + delta)) === value,
    )
  )
    throw new UpcomingClassEditError('invalid');
  return result;
}
export async function editUpcomingClasses(
  db: PrismaClient,
  input: {
    actorId: string;
    templateId: string;
    selected: Array<{ id: string; updatedAt: string; startLocal?: string }>;
    newStarts?: string[];
    sourceId?: string;
    patch: UpcomingClassPatch;
  },
  clock: () => Date = () => new Date(),
) {
  const { patch } = input;
  const ids = input.selected.map((x) => x.id);
  const newStarts = (input.newStarts || []).map(strictStudioStart);
  const moved = new Map(
    input.selected
      .filter((x) => x.startLocal)
      .map((x) => [x.id, strictStudioStart(x.startLocal!)]),
  );
  if (
    (!ids.length && !newStarts.length) ||
    ids.length + newStarts.length > 200 ||
    new Set(ids).size !== ids.length ||
    (!Object.keys(patch).length && !moved.size && !newStarts.length) ||
    (patch.imageUrl !== undefined &&
      patch.imageUrl !== null &&
      patch.imageUrl !== '' &&
      !/^(https:\/\/[^\s]+|\/(?!\/)[^\s]*)$/.test(patch.imageUrl)) ||
    (patch.titleOverride !== undefined &&
      (patch.titleOverride.trim().length < 2 ||
        patch.titleOverride.trim().length > 150)) ||
    (patch.capacity !== undefined &&
      (!Number.isInteger(patch.capacity) ||
        patch.capacity < 1 ||
        patch.capacity > 1000)) ||
    (patch.priceCents !== undefined &&
      (!Number.isInteger(patch.priceCents) ||
        patch.priceCents < 100 ||
        patch.priceCents > 1000000)) ||
    (patch.durationMinutes !== undefined &&
      (!Number.isInteger(patch.durationMinutes) ||
        patch.durationMinutes < 5 ||
        patch.durationMinutes > 480)) ||
    (patch.publicNotes?.length || 0) > 5000
  )
    throw new UpcomingClassEditError('invalid');
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rhyze-schedule-import'))`;
      for (const id of [...ids].sort())
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const now = clock();
      if ([...newStarts, ...moved.values()].some((d) => d <= now))
        throw new UpcomingClassEditError('past');
      const rows = await tx.classOccurrence.findMany({
        where: { id: { in: ids }, templateId: input.templateId },
        include: {
          template: { select: { name: true } },
          _count: {
            select: { bookings: { where: confirmedRosterBookingWhere() } },
          },
        },
      });
      if (rows.length !== ids.length)
        throw new UpcomingClassEditError('invalid');
      if (
        rows.some(
          (r) => r.startAt <= now || r.archivedAt || r.status !== 'SCHEDULED',
        )
      )
        throw new UpcomingClassEditError('past');
      if (
        rows.some(
          (r) =>
            r.updatedAt.toISOString() !==
            input.selected.find((x) => x.id === r.id)?.updatedAt,
        )
      )
        throw new UpcomingClassEditError('stale');
      if (
        patch.instructorId !== undefined &&
        !(await tx.user.findFirst({
          where: {
            AND: [assignableInstructorWhere, { id: patch.instructorId }],
          },
          select: { id: true },
        }))
      )
        throw new UpcomingClassEditError('instructor');
      if (
        patch.capacity !== undefined &&
        rows.some(
          (r) => r._count.bookings + r.historicalSignupCount > patch.capacity!,
        )
      )
        throw new UpcomingClassEditError('capacity');
      const affectedIds = [...ids];
      for (const row of rows) {
        const startAt = moved.get(row.id) || row.startAt;
        const duration =
          patch.durationMinutes ?? (+row.endAt - +row.startAt) / 60000;
        const data: Prisma.ClassOccurrenceUpdateInput = {
          ...(patch.titleOverride !== undefined
            ? { titleOverride: patch.titleOverride.trim() }
            : {}),
          ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
          ...(patch.priceCents !== undefined
            ? { priceCents: patch.priceCents }
            : {}),
          ...(moved.has(row.id) || patch.durationMinutes !== undefined
            ? { startAt, endAt: new Date(+startAt + duration * 60000) }
            : {}),
          ...(patch.imageUrl !== undefined
            ? { imageUrl: patch.imageUrl || null }
            : {}),
          ...(patch.instructorId !== undefined
            ? {
                instructor: { connect: { id: patch.instructorId } },
                substituteInstructorName: null,
                isSubstitute: false,
              }
            : {}),
          ...(patch.publicNotes !== undefined
            ? { publicNotes: patch.publicNotes?.trim() || null }
            : {}),
        };
        await tx.classOccurrence.update({ where: { id: row.id }, data });
      }
      if (newStarts.length) {
        const template = await tx.classTemplate.findUnique({
          where: { id: input.templateId },
        });
        if (!template || !template.isActive || template.archivedAt)
          throw new UpcomingClassEditError('invalid');
        const source =
          rows.find((r) => r.id === input.sourceId) ||
          rows[0] ||
          (await tx.classOccurrence.findFirst({
            where: {
              templateId: input.templateId,
              archivedAt: null,
              ...(input.sourceId ? { id: input.sourceId } : {}),
            },
            orderBy: { startAt: 'desc' },
          }));
        if (input.sourceId && (!source || source.id !== input.sourceId))
          throw new UpcomingClassEditError('invalid');
        const instructorId = patch.instructorId ?? source?.instructorId;
        if (
          !instructorId ||
          !(await tx.user.findFirst({
            where: { AND: [assignableInstructorWhere, { id: instructorId }] },
            select: { id: true },
          }))
        )
          throw new UpcomingClassEditError('instructor');
        for (const startAt of newStarts) {
          if (
            await tx.classOccurrence.findFirst({
              where: {
                templateId: input.templateId,
                startAt,
                status: 'SCHEDULED',
                archivedAt: null,
              },
              select: { id: true },
            })
          )
            throw new UpcomingClassEditError('conflict');
          const duration =
            patch.durationMinutes ??
            (source
              ? (+source.endAt - +source.startAt) / 60000
              : template.durationMinutes);
          const created = await tx.classOccurrence.create({
            data: {
              id: randomUUID(),
              templateId: input.templateId,
              instructorId,
              roomId: source?.roomId,
              startAt,
              endAt: new Date(+startAt + duration * 60000),
              timezone: 'America/New_York',
              titleOverride:
                patch.titleOverride?.trim() ??
                source?.titleOverride ??
                template.name,
              capacity:
                patch.capacity ?? source?.capacity ?? template.defaultCapacity,
              priceCents:
                patch.priceCents ??
                source?.priceCents ??
                template.dropInPriceCents,
              publicNotes:
                patch.publicNotes !== undefined
                  ? patch.publicNotes?.trim() || null
                  : source?.publicNotes,
              imageUrl:
                patch.imageUrl !== undefined
                  ? patch.imageUrl || null
                  : source?.imageUrl,
              instructorPayMethod: source?.instructorPayMethod,
              instructorPayCents: source?.instructorPayCents,
              instructorPayNote: source?.instructorPayNote,
            },
          });
          affectedIds.push(created.id);
        }
      }
      // Validate the resulting selection together so two edited dates cannot overlap.
      if (
        newStarts.length ||
        moved.size ||
        patch.durationMinutes !== undefined ||
        patch.instructorId !== undefined
      ) {
        const changed = await tx.classOccurrence.findMany({
          where: { id: { in: affectedIds } },
        });
        for (const row of changed) {
          if (
            await tx.classOccurrence.findFirst({
              where: {
                id: { not: row.id },
                templateId: row.templateId,
                startAt: row.startAt,
                status: 'SCHEDULED',
                archivedAt: null,
              },
              select: { id: true },
            })
          )
            throw new UpcomingClassEditError('conflict');
          const resources = [
            ...(row.roomId ? [{ roomId: row.roomId }] : []),
            ...(row.instructorId ? [{ instructorId: row.instructorId }] : []),
          ];
          if (
            resources.length &&
            (await tx.classOccurrence.findFirst({
              where: {
                id: { not: row.id },
                status: 'SCHEDULED',
                archivedAt: null,
                OR: resources,
                startAt: { lt: row.endAt },
                endAt: { gt: row.startAt },
              },
              select: { id: true },
            }))
          )
            throw new UpcomingClassEditError('conflict');
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: 'schedule.upcoming-dates-edited',
          entityType: 'ClassTemplate',
          entityId: input.templateId,
          before: rows.map((r) => ({
            id: r.id,
            title: r.titleOverride || r.template.name,
            startAt: r.startAt.toISOString(),
            endAt: r.endAt.toISOString(),
            capacity: r.capacity,
            priceCents: r.priceCents,
            instructorId: r.instructorId,
            publicNotes: r.publicNotes,
          })),
          after: {
            ids: affectedIds,
            patch,
            starts: [...moved].map(([id, at]) => ({
              id,
              startAt: at.toISOString(),
            })),
            added: newStarts.map((d) => d.toISOString()),
            cutoff: now.toISOString(),
            timezone: 'America/New_York',
          },
        },
      });
      return affectedIds.length;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000,
    },
  );
}
