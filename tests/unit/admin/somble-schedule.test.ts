import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { somblePublishedClassSchedule } from '@/lib/import/somble-schedule';
import { ownedEvents, ownedSchedule } from '@/lib/rhyze-platform';

describe('Somble schedule reconciliation', () => {
  it('preserves the supplied August 3 and 4 class counts and times', () => {
    expect(
      ownedSchedule.slice(0, 7).map((slot) => ({
        name: slot.className,
        date: slot.date,
        time: slot.time,
        booked: slot.booked,
      })),
    ).toEqual([
      {
        name: 'Pilates Pulse with Adrianna',
        date: 'Aug 3',
        time: '10:00 AM',
        booked: 2,
      },
      {
        name: 'Flow with Adrianna',
        date: 'Aug 3',
        time: '11:00 AM',
        booked: 0,
      },
      {
        name: 'Ignite with Julie',
        date: 'Aug 3',
        time: '12:00 PM',
        booked: 1,
      },
      {
        name: 'Heels 101 "Walk with Me" with Nicole',
        date: 'Aug 3',
        time: '6:10 PM',
        booked: 2,
      },
      {
        name: 'Vinyasa/Hatha Yoga with Kenzie',
        date: 'Aug 4',
        time: '8:00 AM',
        booked: 0,
      },
      {
        name: 'Global Fit & Flow with Kenzie',
        date: 'Aug 4',
        time: '9:10 AM',
        booked: 0,
      },
      {
        name: 'Rhyze Ritmo with Melissa',
        date: 'Aug 4',
        time: '11:00 AM',
        booked: 1,
      },
    ]);
  });

  it('uses the supplied Somble signup counts for special events', () => {
    expect(ownedEvents.map((event) => [event.name, event.booked])).toEqual([
      ['TCJ Hip-Hop Happy Hour with Tricia', 11],
      ['Hypnotic Heels with Nicole', 1],
      ['Seat Seduction With Vanessa', 0],
    ]);
  });

  it('matches every standard class published by Somble through September 11', () => {
    expect(somblePublishedClassSchedule).toHaveLength(73);
    expect(
      somblePublishedClassSchedule
        .filter((slot) => slot.isoDate === '2026-08-04')
        .map((slot) => [slot.time, slot.className, slot.instructor]),
    ).toEqual([
      ['8:00 AM', 'Vinyasa/Hatha Yoga with Kenzie', 'Mackenzie Heffernan'],
      ['9:10 AM', 'Global Fit & Flow with Kenzie', 'Mackenzie Heffernan'],
      ['11:00 AM', 'Rhyze Ritmo with Melissa', 'Melissa Llanos'],
      ['6:00 PM', 'Soul Line & Groove with Rachel', 'Rachel'],
      ['7:10 PM', 'Rhyze Up with Vanessa', 'Vanessa Ramos'],
    ]);
    expect(
      somblePublishedClassSchedule
        .filter((slot) => slot.isoDate === '2026-08-05')
        .map((slot) => [slot.time, slot.className, slot.instructor]),
    ).toEqual([
      ['10:00 AM', 'Pilates Pulse with Adrianna', 'Adrianna Jones'],
      ['11:00 AM', 'Flow with Adrianna', 'Adrianna Jones'],
      ['12:00 PM', 'Ignite with Julie', 'Julie Reese'],
      ['5:00 PM', 'Core 360 with Carla', 'Carla Hotrock'],
      ['6:00 PM', 'Grind & Grow with Carla', 'Carla Hotrock'],
      ['7:10 PM', 'Real Riddim Dance Workout with Vanessa', 'Vanessa Ramos'],
    ]);
    expect(
      somblePublishedClassSchedule
        .filter((slot) => slot.classSlug === 'rhyze-up-vanessa')
        .map((slot) => [slot.isoDate, slot.time]),
    ).toEqual([
      ['2026-08-04', '7:10 PM'],
      ['2026-08-06', '7:10 PM'],
      ['2026-08-11', '7:10 PM'],
      ['2026-08-13', '7:10 PM'],
      ['2026-08-18', '7:10 PM'],
      ['2026-08-20', '7:10 PM'],
      ['2026-08-25', '7:10 PM'],
      ['2026-08-27', '7:10 PM'],
    ]);
    expect(somblePublishedClassSchedule.at(-1)).toMatchObject({
      isoDate: '2026-09-11',
      time: '12:00 PM',
      className: 'Ignite with Julie',
    });
  });

  it('keeps the supplied roster counts on their exact Somble occurrences', () => {
    const bookedByOccurrence = new Map(
      somblePublishedClassSchedule.map((slot) => [
        slot.occurrenceId,
        slot.booked,
      ]),
    );

    expect(bookedByOccurrence.get('owned-mon-pilates-0')).toBe(2);
    expect(bookedByOccurrence.get('owned-mon-ignite-0')).toBe(1);
    expect(bookedByOccurrence.get('owned-mon-heels-101-0')).toBe(2);
    expect(bookedByOccurrence.get('owned-wed-real-riddim-0')).toBe(3);
    expect(bookedByOccurrence.get('owned-sun-yoga-0')).toBe(1);
  });

  it('syncs exact published occurrences and refuses to discard booked history', () => {
    const source = readFileSync('scripts/sync-owned-catalog.ts', 'utf8');
    const seedSource = readFileSync('prisma/seed.ts', 'utf8');

    expect(source).toContain('somblePublishedClassSchedule');
    expect(source).not.toContain('week < 5');
    expect(source).toContain('staleManagedOccurrences');
    expect(source).toContain('Cannot remove stale Somble occurrence');
    expect(source).toContain("'pilates-pulse'");
    expect(source).toContain("'rhyze-up'");
    expect(source).toContain('removedTemplateSlugs');
    expect(source).toContain("'dance-fit-jessica'");
    expect(source).toContain("'hypnotic-heels-jessica-weekly-class'");
    expect(source).toContain('retiredTemplateSlugs');
    expect(seedSource).toContain("slug: 'rhyze-up-vanessa'");
    expect(seedSource).toContain("slug: 'pilates-pulse-adrianna'");
    expect(seedSource).not.toContain("slug: 'rhyze-up',");
    expect(seedSource).not.toContain("slug: 'pilates-pulse',");
    expect(seedSource).toContain("email: 'vanessa@rhyzefit.com'");
    expect(seedSource).not.toContain("email: 'vanessa@rhyze.local'");
  });
});
