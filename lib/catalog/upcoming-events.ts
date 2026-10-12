import type { Prisma } from '@prisma/client';
import { publicEventClassificationWhere } from './member-class-event';

export function upcomingEventOccurrenceWhere(now: Date) {
  return {
    status: 'SCHEDULED',
    startAt: { gte: now },
  } satisfies Prisma.ClassOccurrenceWhereInput;
}

export function upcomingEventTemplateWhere(now: Date) {
  return {
    ...publicEventClassificationWhere(),
    isActive: true,
    archivedAt: null,
    occurrences: { some: upcomingEventOccurrenceWhere(now) },
  } satisfies Prisma.ClassTemplateWhereInput;
}
