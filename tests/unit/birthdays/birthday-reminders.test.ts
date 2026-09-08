import { describe, expect, it } from 'vitest';
import {
  birthdayDateFromMonthDay,
  buildBirthdayReminderPlans,
} from '@/lib/domain/birthdays/birthday-reminders';

const people = [
  {
    id: 'member-september',
    name: 'September Member',
    email: 'september@example.com',
    role: 'MEMBER',
    dateOfBirth: new Date('1991-09-08T12:00:00.000Z'),
  },
  {
    id: 'instructor-september',
    name: 'September Instructor',
    email: 'instructor@example.com',
    role: 'INSTRUCTOR',
    dateOfBirth: new Date('2000-09-21T12:00:00.000Z'),
  },
  {
    id: 'member-october',
    name: 'October Member',
    email: 'october@example.com',
    role: 'MEMBER',
    dateOfBirth: new Date('1985-10-01T12:00:00.000Z'),
  },
];

describe('birthday reminders', () => {
  it('stores a valid birthday from month and day without asking for a year', () => {
    expect(birthdayDateFromMonthDay(2, 29)).toEqual(
      new Date('2000-02-29T12:00:00.000Z'),
    );
    expect(() => birthdayDateFromMonthDay(2, 30)).toThrow(
      'Enter a valid birthday.',
    );
  });

  it('builds a first-of-month digest for Vanessa and Melissa', () => {
    const plans = buildBirthdayReminderPlans(
      new Date('2026-09-01T10:00:00.000Z'),
      people,
    ).filter((plan) => plan.kind === 'MONTHLY');

    expect(plans).toHaveLength(2);
    expect(plans.map((plan) => plan.to)).toEqual([
      'vanessa@rhyzefit.com',
      'melissa@rhyzefit.com',
    ]);
    expect(plans[0]).toMatchObject({
      subject: 'September birthdays at Rhyze',
      template: 'BIRTHDAY_MONTHLY_DIGEST',
      dedupeKey: 'birthday-monthly:2026-09:vanessa@rhyzefit.com',
      payload: {
        monthName: 'September',
        birthdayList:
          'September 8 — September Member (Member); September 21 — September Instructor (Instructor)',
      },
    });
  });

  it('builds an exact seven-day reminder across a month boundary', () => {
    const plans = buildBirthdayReminderPlans(
      new Date('2026-09-24T10:00:00.000Z'),
      people,
    ).filter((plan) => plan.kind === 'WEEK_AHEAD');

    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({
      subject: 'Birthday in one week: October Member',
      template: 'BIRTHDAY_WEEK_AHEAD',
      dedupeKey: 'birthday-week-ahead:2026-10-01:vanessa@rhyzefit.com',
      payload: {
        birthdayDate: 'October 1',
        birthdayList: 'October Member (Member)',
      },
    });
  });
});
