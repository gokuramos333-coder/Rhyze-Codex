import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { instructors } from '@/lib/instructors';
import { ownedSchedule } from '@/lib/rhyze-platform';
import { uniqueClassTitles } from '@/lib/catalog/unique-class-titles';
import { publicBookingCountLabel } from '@/lib/catalog/public-booking-count';

describe('public catalog rules', () => {
  it('charges $25 for every standard class', () => {
    expect(ownedSchedule.every((slot) => slot.price === '$25')).toBe(true);
  });

  it('uses the canonical instructor photo for every scheduled class', () => {
    for (const slot of ownedSchedule) {
      const instructor = instructors.find(
        (item) => slot.instructor.toLowerCase().startsWith(item.firstName.toLowerCase()),
      );
      expect(instructor, slot.instructor).toBeDefined();
      expect(slot.photo).toBe(instructor?.photo);
      expect(existsSync(`public${slot.photo}`), slot.photo).toBe(true);
    }
  });

  it('lists repeated instructor class titles once', () => {
    expect(
      uniqueClassTitles([
        'Vinyasa/Hatha Yoga with Kenzie',
        'Global Fit & Flow with Kenzie',
        'Vinyasa/Hatha Yoga with Kenzie',
      ]),
    ).toEqual([
      'Vinyasa/Hatha Yoga with Kenzie',
      'Global Fit & Flow with Kenzie',
    ]);
  });

  it('shows public booking totals only once ten people are booked', () => {
    expect(publicBookingCountLabel(0, 25)).toBeNull();
    expect(publicBookingCountLabel(9, 25)).toBeNull();
    expect(publicBookingCountLabel(10, 25)).toBe('10/25 booked');
    expect(publicBookingCountLabel(11, 25)).toBe('11/25 booked');
  });
});
