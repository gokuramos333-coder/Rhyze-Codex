import type { Prisma } from '@prisma/client';

// Discovery only: never publish an unscheduled/closed event or change admission.
export function publicClassCatalogWhere(now = new Date()) {
  return {
    isActive: true,
    archivedAt: null,
    OR: [
      { isEvent: false },
      { isEvent: true, occurrences: { some: { status: 'SCHEDULED', startAt: { gte: now } } } },
    ],
  } satisfies Prisma.ClassTemplateWhereInput;
}
