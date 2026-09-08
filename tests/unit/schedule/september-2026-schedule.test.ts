import { describe, expect, it } from 'vitest';
import { SEPTEMBER_2026_SCHEDULE } from '@/lib/domain/schedule/september-2026-schedule';

describe('September 2026 schedule', () => {
  it('contains every slot from the approved calendar', () => {
    expect(SEPTEMBER_2026_SCHEDULE).toHaveLength(81);
    expect(
      SEPTEMBER_2026_SCHEDULE.map(({ date, time, templateSlug }) =>
        `${date} ${time} ${templateSlug}`,
      ),
    ).toEqual(expect.arrayContaining([
      '2026-09-07 09:00 pilates-pulse-adrianna',
      '2026-09-14 16:30 pound-mackenzie',
      '2026-09-18 18:45 seat-seduction-vanessa',
      '2026-09-24 18:10 rhyze-up-vanessa',
      '2026-09-26 12:00 mommy-and-me-dennisse',
      '2026-09-30 19:10 real-riddim-dance-workout-vanessa',
    ]));
  });

  it('uses the approved durations and TBA instructors for the new formats', () => {
    const pound = SEPTEMBER_2026_SCHEDULE.filter(
      (slot) => slot.templateSlug === 'pound-mackenzie',
    );
    const workAndTone = SEPTEMBER_2026_SCHEDULE.filter(
      (slot) => slot.templateSlug === 'work-tone-mswoy36a',
    );
    const mommyAndMe = SEPTEMBER_2026_SCHEDULE.filter(
      (slot) => slot.templateSlug === 'mommy-and-me-dennisse',
    );

    expect(pound).toHaveLength(3);
    expect(pound.every((slot) => slot.durationMinutes === 30)).toBe(true);
    expect(workAndTone).toHaveLength(8);
    expect(workAndTone.every((slot) => slot.instructorEmail === null)).toBe(true);
    expect(mommyAndMe).toEqual([
      expect.objectContaining({
        date: '2026-09-26',
        time: '12:00',
        durationMinutes: 45,
        instructorEmail: null,
      }),
    ]);
  });

  it('applies the corrected September titles, instructor labels, and substitute status', () => {
    const find = (date: string, time: string) =>
      SEPTEMBER_2026_SCHEDULE.find(
        (slot) => slot.date === date && slot.time === time,
      );

    for (const day of ['01', '08', '15', '22', '29']) {
      expect(find(`2026-09-${day}`, '07:00')).toEqual(
        expect.objectContaining({ titleOverride: 'Power Yoga' }),
      );
    }
    for (const day of ['02', '09', '16', '23', '30']) {
      expect(find(`2026-09-${day}`, '11:00')).toEqual(
        expect.objectContaining({ titleOverride: 'Yoga Sculpt' }),
      );
    }
    for (const day of ['10', '17', '24']) {
      expect(find(`2026-09-${day}`, '07:00')).toEqual(
        expect.objectContaining({
          templateSlug: 'global-hiit-mackenzie',
          titleOverride: 'Global Fit & Flow',
        }),
      );
    }

    const kenzieClasses = SEPTEMBER_2026_SCHEDULE.filter(
      (slot) => slot.instructorEmail === 'kenzie41796@gmail.com',
    );
    expect(kenzieClasses.length).toBeGreaterThan(0);
    expect(
      kenzieClasses.every((slot) => slot.displayInstructorName === 'Kenzie'),
    ).toBe(true);
    for (const day of ['06', '13', '20', '27']) {
      expect(find(`2026-09-${day}`, '09:00')).toEqual(
        expect.objectContaining({ titleOverride: 'Vinyasa/Hatha Yoga' }),
      );
    }

    expect(find('2026-09-02', '19:10')).toEqual(
      expect.objectContaining({
        displayInstructorName: 'Dennisse',
        isSubstitute: true,
      }),
    );
    expect(find('2026-09-05', '11:00')).toEqual(
      expect.objectContaining({ displayInstructorName: 'Avery' }),
    );
    expect(find('2026-09-12', '12:00')).toEqual(
      expect.objectContaining({
        displayInstructorName: 'Dennisse',
        isSubstitute: false,
      }),
    );
    expect(find('2026-09-14', '16:30')).toEqual(
      expect.objectContaining({
        displayInstructorName: 'Kenzie',
        titleOverride: 'POUND',
      }),
    );
  });

  it('matches every date and time shown on the September calendar', () => {
    const byDay = Object.groupBy(
      SEPTEMBER_2026_SCHEDULE,
      (slot) => slot.date.slice(-2),
    );
    const compact = Object.fromEntries(
      Object.entries(byDay).map(([day, slots]) => [
        day,
        slots!.map((slot) => `${slot.time} ${slot.templateSlug}`),
      ]),
    );

    expect(compact).toEqual({
      '01': ['07:00 yoga-vinyasa-mackenzie', '11:00 rhyze-ritmo-melissa', '18:00 soul-line-dancing-rachel', '19:10 rhyze-ritmo-melissa'],
      '02': ['07:15 pilates-pulse-adrianna', '11:00 yoga-flow-adrianna', '12:00 ignite-julie', '19:10 real-riddim-dance-workout-vanessa'],
      '03': ['07:00 global-hiit-mackenzie', '11:00 rhyze-ritmo-melissa', '19:10 rhyze-ritmo-melissa'],
      '05': ['11:00 work-tone-mswoy36a'],
      '06': ['09:00 yoga-vinyasa-mackenzie'],
      '07': ['09:00 pilates-pulse-adrianna'],
      '08': ['07:00 yoga-vinyasa-mackenzie', '11:00 rhyze-ritmo-melissa', '18:00 soul-line-dancing-rachel', '19:10 rhyze-up-vanessa'],
      '09': ['07:15 pilates-pulse-adrianna', '11:00 yoga-flow-adrianna', '12:00 ignite-julie', '18:00 work-tone-mswoy36a', '19:10 real-riddim-dance-workout-vanessa'],
      '10': ['07:00 global-hiit-mackenzie', '11:00 rhyze-ritmo-melissa', '19:10 rhyze-up-vanessa'],
      '12': ['11:00 work-tone-mswoy36a', '12:00 real-riddim-dance-workout-vanessa'],
      '13': ['09:00 yoga-vinyasa-mackenzie'],
      '14': ['12:00 ignite-julie', '16:30 pound-mackenzie', '17:10 global-hiit-mackenzie', '19:15 tcj-hip-hop-happy-hour-tricia'],
      '15': ['07:00 yoga-vinyasa-mackenzie', '11:00 rhyze-ritmo-melissa', '18:00 soul-line-dancing-rachel', '19:10 rhyze-up-vanessa'],
      '16': ['07:15 pilates-pulse-adrianna', '11:00 yoga-flow-adrianna', '12:00 ignite-julie', '18:00 work-tone-mswoy36a', '19:10 real-riddim-dance-workout-vanessa'],
      '17': ['07:00 global-hiit-mackenzie', '11:00 rhyze-ritmo-melissa', '18:00 heels-101-walk-with-me-nicole', '19:10 rhyze-up-vanessa'],
      '18': ['18:45 seat-seduction-vanessa'],
      '19': ['11:00 work-tone-mswoy36a', '12:00 real-riddim-dance-workout-vanessa'],
      '20': ['09:00 yoga-vinyasa-mackenzie'],
      '21': ['12:00 ignite-julie', '16:30 pound-mackenzie', '17:10 global-hiit-mackenzie'],
      '22': ['07:00 yoga-vinyasa-mackenzie', '11:00 rhyze-ritmo-melissa', '18:00 soul-line-dancing-rachel', '19:10 rhyze-up-vanessa'],
      '23': ['07:15 pilates-pulse-adrianna', '11:00 yoga-flow-adrianna', '12:00 ignite-julie', '18:00 work-tone-mswoy36a', '19:10 real-riddim-dance-workout-vanessa'],
      '24': ['07:00 global-hiit-mackenzie', '11:00 rhyze-ritmo-melissa', '18:10 rhyze-up-vanessa', '19:15 hypnotic-heels-nicole'],
      '26': ['11:00 work-tone-mswoy36a', '12:00 mommy-and-me-dennisse'],
      '27': ['09:00 yoga-vinyasa-mackenzie'],
      '28': ['12:00 ignite-julie', '16:30 pound-mackenzie', '17:10 global-hiit-mackenzie'],
      '29': ['07:00 yoga-vinyasa-mackenzie', '11:00 rhyze-ritmo-melissa', '18:00 soul-line-dancing-rachel', '19:10 rhyze-up-vanessa'],
      '30': ['07:15 pilates-pulse-adrianna', '11:00 yoga-flow-adrianna', '12:00 ignite-julie', '18:00 work-tone-mswoy36a', '19:10 real-riddim-dance-workout-vanessa'],
    });
  });
});
