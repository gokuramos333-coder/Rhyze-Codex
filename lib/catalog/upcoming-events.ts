import type { Prisma } from '@prisma/client';

export function upcomingEventOccurrenceWhere(now: Date) {
  return {
    status: 'SCHEDULED',
    startAt: { gte: now },
  } satisfies Prisma.ClassOccurrenceWhereInput;
}

export function upcomingEventTemplateWhere(now: Date) {
  return {
    isEvent: true,
    isActive: true,
    archivedAt: null,
    occurrences: { some: upcomingEventOccurrenceWhere(now) },
  } satisfies Prisma.ClassTemplateWhereInput;
}
