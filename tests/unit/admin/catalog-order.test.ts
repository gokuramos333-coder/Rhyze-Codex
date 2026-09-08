import { describe, expect, it } from 'vitest';
import { sortCatalogByNextOccurrence } from '@/lib/admin/catalog-order';

describe('admin catalog chronology', () => {
  it('sorts offerings by their next occurrence and leaves unscheduled items last', () => {
    const items = [
      { id: 'later', occurrences: [{ startAt: new Date('2026-08-21T18:45:00-04:00') }] },
      { id: 'missing', occurrences: [] },
      { id: 'first', occurrences: [{ startAt: new Date('2026-08-03T19:15:00-04:00') }] },
    ];

    expect(sortCatalogByNextOccurrence(items).map((item) => item.id)).toEqual([
      'first',
      'later',
      'missing',
    ]);
  });
});
