import { describe, expect, it } from 'vitest';
import { upcomingEventTemplateWhere } from '@/lib/catalog/upcoming-events';

describe('upcoming public events query', () => {
  it('keeps only active event templates with scheduled future occurrences', () => {
    const now = new Date('2026-09-08T14:00:00.000Z');

    expect(upcomingEventTemplateWhere(now)).toEqual({
      isEvent: true,
      isActive: true,
      archivedAt: null,
      occurrences: {
        some: {
          status: 'SCHEDULED',
          startAt: { gte: now },
        },
      },
    });
  });
});
