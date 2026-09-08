const STUDIO_TIMEZONE = 'America/New_York';
const BIRTHDAY_STORAGE_YEAR = 2000;

export const BIRTHDAY_REMINDER_RECIPIENTS = [
  'vanessa@rhyzefit.com',
  'melissa@rhyzefit.com',
] as const;

export type BirthdayPerson = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  dateOfBirth: Date;
};

export type BirthdayReminderPlan = {
  kind: 'MONTHLY' | 'WEEK_AHEAD';
  to: (typeof BIRTHDAY_REMINDER_RECIPIENTS)[number];
  subject: string;
  template: 'BIRTHDAY_MONTHLY_DIGEST' | 'BIRTHDAY_WEEK_AHEAD';
  payload: Record<string, string>;
  dedupeKey: string;
};

export function birthdayDateFromMonthDay(month: number, day: number) {
  const birthday = new Date(
    Date.UTC(BIRTHDAY_STORAGE_YEAR, month - 1, day, 12),
  );
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    birthday.getUTCMonth() !== month - 1 ||
    birthday.getUTCDate() !== day
  ) {
    throw new Error('Enter a valid birthday.');
  }
  return birthday;
}

export function birthdayMonthDay(date: Date | null | undefined) {
  if (!date) return { month: null, day: null };
  return { month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function studioDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STUDIO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthDayFromKey(dateKey: string) {
  const [, month, day] = dateKey.split('-').map(Number);
  return { month, day };
}

function monthName(month: number) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(BIRTHDAY_STORAGE_YEAR, month - 1, 1)));
}

function birthdayLabel(month: number, day: number) {
  return `${monthName(month)} ${day}`;
}

function roleLabel(role: string) {
  return role === 'INSTRUCTOR' ? 'Instructor' : 'Member';
}

function personName(person: BirthdayPerson) {
  return person.name?.trim() || person.email;
}

function sortedBirthdays(people: BirthdayPerson[]) {
  return [...people].sort((left, right) => {
    const leftDate = birthdayMonthDay(left.dateOfBirth);
    const rightDate = birthdayMonthDay(right.dateOfBirth);
    return (
      (leftDate.month || 0) - (rightDate.month || 0) ||
      (leftDate.day || 0) - (rightDate.day || 0) ||
      personName(left).localeCompare(personName(right))
    );
  });
}

export function buildBirthdayReminderPlans(
  now: Date,
  people: BirthdayPerson[],
): BirthdayReminderPlan[] {
  const todayKey = studioDateKey(now);
  const [year, currentMonth, currentDay] = todayKey.split('-').map(Number);
  const eligible = people.filter((person) =>
    ['MEMBER', 'INSTRUCTOR'].includes(person.role),
  );
  const plans: BirthdayReminderPlan[] = [];

  if (currentDay === 1) {
    const monthly = sortedBirthdays(
      eligible.filter(
        (person) => birthdayMonthDay(person.dateOfBirth).month === currentMonth,
      ),
    );
    if (monthly.length) {
      const month = monthName(currentMonth);
      const birthdayList = monthly
        .map((person) => {
          const parts = birthdayMonthDay(person.dateOfBirth);
          return `${birthdayLabel(parts.month!, parts.day!)} — ${personName(person)} (${roleLabel(person.role)})`;
        })
        .join('; ');
      for (const to of BIRTHDAY_REMINDER_RECIPIENTS) {
        plans.push({
          kind: 'MONTHLY',
          to,
          subject: `${month} birthdays at Rhyze`,
          template: 'BIRTHDAY_MONTHLY_DIGEST',
          payload: { monthName: month, birthdayList },
          dedupeKey: `birthday-monthly:${year}-${String(currentMonth).padStart(2, '0')}:${to}`,
        });
      }
    }
  }

  const targetKey = shiftDateKey(todayKey, 7);
  const target = monthDayFromKey(targetKey);
  const weekAhead = sortedBirthdays(
    eligible.filter((person) => {
      const birthday = birthdayMonthDay(person.dateOfBirth);
      return birthday.month === target.month && birthday.day === target.day;
    }),
  );
  if (weekAhead.length) {
    const birthdayList = weekAhead
      .map((person) => `${personName(person)} (${roleLabel(person.role)})`)
      .join('; ');
    const names = weekAhead.map(personName).join(', ');
    for (const to of BIRTHDAY_REMINDER_RECIPIENTS) {
      plans.push({
        kind: 'WEEK_AHEAD',
        to,
        subject: `Birthday in one week: ${names}`,
        template: 'BIRTHDAY_WEEK_AHEAD',
        payload: {
          birthdayDate: birthdayLabel(target.month, target.day),
          birthdayList,
        },
        dedupeKey: `birthday-week-ahead:${targetKey}:${to}`,
      });
    }
  }

  return plans;
}
