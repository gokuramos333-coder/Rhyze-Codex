import { ownedSchedule } from '@/lib/rhyze-platform';

type OwnedScheduleSlot = (typeof ownedSchedule)[number];

const publishedDatesBySlotId: Record<
  OwnedScheduleSlot['id'],
  readonly string[]
> = {
  'mon-pilates': [
    '2026-08-03',
    '2026-08-10',
    '2026-08-17',
    '2026-08-24',
  ],
  'mon-yoga': [
    '2026-08-03',
    '2026-08-10',
    '2026-08-17',
    '2026-08-24',
  ],
  'mon-ignite': [
    '2026-08-03',
    '2026-08-10',
    '2026-08-17',
    '2026-08-24',
  ],
  'mon-heels-101': ['2026-08-03'],
  'tue-yoga': [
    '2026-08-04',
    '2026-08-11',
    '2026-08-18',
    '2026-08-25',
  ],
  'tue-global-flow': [
    '2026-08-04',
    '2026-08-11',
    '2026-08-18',
    '2026-08-25',
  ],
  'tue-ritmo': [
    '2026-08-04',
    '2026-08-11',
    '2026-08-18',
    '2026-08-25',
  ],
  'tue-soul-line': [
    '2026-08-04',
    '2026-08-11',
    '2026-08-18',
    '2026-08-25',
  ],
  'tue-rhyze-up': [
    '2026-08-04',
    '2026-08-11',
    '2026-08-18',
    '2026-08-25',
  ],
  'wed-pilates': [
    '2026-08-05',
    '2026-08-12',
    '2026-08-19',
    '2026-08-26',
  ],
  'wed-yoga': [
    '2026-08-05',
    '2026-08-12',
    '2026-08-19',
    '2026-08-26',
  ],
  'wed-ignite': [
    '2026-08-05',
    '2026-08-12',
    '2026-08-19',
    '2026-08-26',
  ],
  'wed-core': [
    '2026-08-05',
    '2026-08-12',
    '2026-08-19',
    '2026-08-26',
  ],
  'wed-grind': [
    '2026-08-05',
    '2026-08-12',
    '2026-08-19',
    '2026-08-26',
  ],
  'wed-real-riddim': [
    '2026-08-05',
    '2026-08-12',
    '2026-08-19',
    '2026-08-26',
  ],
  'thu-ritmo': [
    '2026-08-06',
    '2026-08-13',
    '2026-08-20',
    '2026-08-27',
  ],
  'thu-rhyze-up': [
    '2026-08-06',
    '2026-08-13',
    '2026-08-20',
    '2026-08-27',
  ],
  'fri-ignite': [
    '2026-08-07',
    '2026-08-14',
    '2026-08-21',
    '2026-08-28',
    '2026-09-11',
  ],
  'sun-yoga': ['2026-08-09', '2026-08-16', '2026-08-23'],
};

function timeMinutes(time: string) {
  const [clock, meridiem] = time.split(' ');
  const [hourText, minuteText] = clock.split(':');
  let hour = Number(hourText);
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour * 60 + Number(minuteText);
}

export const somblePublishedClassSchedule = ownedSchedule
  .flatMap((slot) =>
    publishedDatesBySlotId[slot.id].map((isoDate, index) => ({
      ...slot,
      occurrenceId: `owned-${slot.id}-${index}`,
      isoDate,
      booked: index === 0 ? slot.booked : 0,
      historicalSignupCount:
        slot.id === 'tue-ritmo' && index === 0 ? slot.booked : 0,
    })),
  )
  .sort(
    (left, right) =>
      left.isoDate.localeCompare(right.isoDate) ||
      timeMinutes(left.time) - timeMinutes(right.time),
  );

export const somblePublishedOccurrenceIds = new Set(
  somblePublishedClassSchedule.map((slot) => slot.occurrenceId),
);
