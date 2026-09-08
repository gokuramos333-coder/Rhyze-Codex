import { describe, expect, it } from 'vitest';
import { classTemplateHasProtectedHistory } from '@/lib/domain/classes/class-template-deletion';

const emptyCounts = {
  bookings: 0,
  waitlistEntries: 0,
  attendanceRecords: 0,
  classMessages: 0,
  commerceOrders: 0,
};

describe('class template deletion protection', () => {
  it('allows deletion when every occurrence is empty', () => {
    expect(
      classTemplateHasProtectedHistory([
        { _count: emptyCounts },
        { _count: { ...emptyCounts } },
      ]),
    ).toBe(false);
  });

  it.each([
    'bookings',
    'waitlistEntries',
    'attendanceRecords',
    'classMessages',
    'commerceOrders',
  ] as const)('protects a class with %s history', (relation) => {
    expect(
      classTemplateHasProtectedHistory([
        { _count: { ...emptyCounts, [relation]: 1 } },
      ]),
    ).toBe(true);
  });
});
