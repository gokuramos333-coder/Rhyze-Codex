import { describe, expect, it } from 'vitest';
import { upcomingEventTemplateWhere } from '@/lib/catalog/upcoming-events';

describe('upcoming public events query', () => {
  it('keeps active future events and the specific Rachel member-credit event', () => {
    const now = new Date('2026-09-08T14:00:00.000Z');

    expect(upcomingEventTemplateWhere(now)).toEqual({
      OR: [{ isEvent: true }, { isEvent: false, slug: 'soul-line-dancing-rachel' }],
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
