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
export async function editUpcomingClasses(
  db: PrismaClient,
  input: {
    actorId: string;
    templateId: string;
    selected: Array<{ id: string; updatedAt: string }>;
    patch: UpcomingClassPatch;
  },
  clock: () => Date = () => new Date(),
) {
  const { patch } = input;
  const ids = input.selected.map((x) => x.id);
  if (
    !ids.length ||
    ids.length > 200 ||
    new Set(ids).size !== ids.length ||
    !Object.keys(patch).length ||
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
      for (const row of rows) {
        const data: Prisma.ClassOccurrenceUpdateInput = {
          ...(patch.titleOverride !== undefined
            ? { titleOverride: patch.titleOverride.trim() }
            : {}),
          ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
          ...(patch.priceCents !== undefined
            ? { priceCents: patch.priceCents }
            : {}),
          ...(patch.durationMinutes !== undefined
            ? { endAt: new Date(+row.startAt + patch.durationMinutes * 60000) }
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
      // Validate the resulting selection together so two edited dates cannot overlap.
      if (
        patch.durationMinutes !== undefined ||
        patch.instructorId !== undefined
      ) {
        const changed = await tx.classOccurrence.findMany({
          where: { id: { in: ids } },
        });
        for (const row of changed) {
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
            ids,
            patch,
            cutoff: now.toISOString(),
            timezone: 'America/New_York',
          },
        },
      });
      return rows.length;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000,
    },
  );
}
