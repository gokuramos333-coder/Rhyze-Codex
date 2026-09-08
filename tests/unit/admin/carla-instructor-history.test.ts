import { describe, expect, it } from 'vitest';
import { planCarlaInstructorHistoryCleanup } from '@/lib/domain/instructors/carla-history';

describe('Carla instructor history cleanup', () => {
  it('keeps only the August 5 class with one confirmed member and detaches every empty occurrence', () => {
    const plan = planCarlaInstructorHistoryCleanup([
      {
        id: 'empty-before',
        templateSlug: 'core-360-carla-rio',
        startAt: new Date('2026-08-05T21:00:00.000Z'),
        confirmedBookings: 0,
      },
      {
        id: 'real-class',
        templateSlug: 'grind-and-grow-carla-reo',
        startAt: new Date('2026-08-05T22:00:00.000Z'),
        confirmedBookings: 1,
      },
      {
        id: 'empty-after',
        templateSlug: 'grind-and-grow-carla-reo',
        startAt: new Date('2026-08-12T22:00:00.000Z'),
        confirmedBookings: 0,
      },
    ]);

    expect(plan).toEqual({
      keptOccurrenceId: 'real-class',
      detachedOccurrenceIds: ['empty-before', 'empty-after'],
    });
  });

  it('refuses cleanup when the one real taught class cannot be identified exactly', () => {
    expect(() => planCarlaInstructorHistoryCleanup([])).toThrow(
      'expected exactly one taught class',
    );
    expect(() => planCarlaInstructorHistoryCleanup([
      {
        id: 'wrong-count',
        templateSlug: 'grind-and-grow-carla-reo',
        startAt: new Date('2026-08-05T22:00:00.000Z'),
        confirmedBookings: 2,
      },
    ])).toThrow('expected exactly one taught class');
  });
});
