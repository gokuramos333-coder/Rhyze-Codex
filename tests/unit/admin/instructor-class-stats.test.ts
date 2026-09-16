import { describe, expect, it } from 'vitest';
import { instructorClassStats } from '@/lib/domain/instructors/instructor-class-stats';

describe('instructorClassStats', () => {
  it('counts only classes the instructor actually taught and reports the current month', () => {
    const stats = instructorClassStats({
      now: new Date('2026-09-14T16:00:00.000Z'),
      instructorName: 'Julie Reese',
      occurrences: [
        { startAt: new Date('2026-08-31T16:00:00.000Z'), status: 'SCHEDULED', isSubstitute: false, substituteInstructorName: null, attendeeCount: 2 },
        { startAt: new Date('2026-09-02T16:00:00.000Z'), status: 'SCHEDULED', isSubstitute: false, substituteInstructorName: null, attendeeCount: 3 },
        { startAt: new Date('2026-09-07T16:00:00.000Z'), status: 'COMPLETED', isSubstitute: false, substituteInstructorName: null, attendeeCount: 1 },
        { startAt: new Date('2026-09-09T16:00:00.000Z'), status: 'CANCELLED', isSubstitute: false, substituteInstructorName: null, attendeeCount: 4 },
        { startAt: new Date('2026-09-12T16:00:00.000Z'), status: 'SCHEDULED', isSubstitute: true, substituteInstructorName: 'Guest Teacher', attendeeCount: 5 },
        { startAt: new Date('2026-09-13T16:00:00.000Z'), status: 'SCHEDULED', isSubstitute: false, substituteInstructorName: null, attendeeCount: 0 },
        { startAt: new Date('2026-09-15T16:00:00.000Z'), status: 'SCHEDULED', isSubstitute: false, substituteInstructorName: null, attendeeCount: 0 },
      ],
    });

    expect(stats).toEqual({
      taughtThisMonth: 2,
      pastTaught: 3,
      upcoming: 1,
    });
  });

  it('credits a substitute class to the assigned instructor when the displayed name matches', () => {
    const stats = instructorClassStats({
      now: new Date('2026-09-14T16:00:00.000Z'),
      instructorName: 'Dennisse Mendoza',
      occurrences: [
        { startAt: new Date('2026-09-12T16:00:00.000Z'), status: 'SCHEDULED', isSubstitute: true, substituteInstructorName: 'Dennisse', attendeeCount: 1 },
      ],
    });

    expect(stats.taughtThisMonth).toBe(1);
    expect(stats.pastTaught).toBe(1);
  });

  it('does not count a past zero-attendee date as taught', () => {
    const stats = instructorClassStats({
      now: new Date('2026-09-14T16:00:00.000Z'),
      instructorName: 'Julie Reese',
      occurrences: [
        { startAt: new Date('2026-09-02T16:00:00.000Z'), status: 'SCHEDULED', isSubstitute: false, substituteInstructorName: null, attendeeCount: 0 },
        { startAt: new Date('2026-09-09T16:00:00.000Z'), status: 'COMPLETED', isSubstitute: false, substituteInstructorName: null, attendeeCount: 0 },
      ],
    });

    expect(stats.taughtThisMonth).toBe(0);
    expect(stats.pastTaught).toBe(0);
  });
});
