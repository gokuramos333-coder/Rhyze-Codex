export type SeptemberScheduleSlot = {
  date: string;
  time: string;
  templateSlug: string;
  instructorEmail: string | null;
  durationMinutes: number;
  titleOverride?: string;
  displayInstructorName?: string;
  isSubstitute?: boolean;
  plannedInstructor?: 'Avery' | 'Dennisse';
};

const instructor = {
  adrianna: 'a.altajones@gmail.com',
  julie: 'gritandgracefitnessnj@gmail.com',
  kenzie: 'kenzie41796@gmail.com',
  melissa: 'melissa@rhyzefit.com',
  nicole: 'nicolesak303@gmail.com',
  rachel: 'rrose973@yahoo.com',
  tricia: 'tcjdancefit@gmail.com',
  vanessa: 'vxnessaramos@gmail.com',
} as const;

function dates(
  days: number[],
  input: Omit<SeptemberScheduleSlot, 'date'>,
): SeptemberScheduleSlot[] {
  return days.map((day) => ({
    ...input,
    date: `2026-09-${String(day).padStart(2, '0')}`,
  }));
}

export const SEPTEMBER_2026_SCHEDULE: SeptemberScheduleSlot[] = [
  ...dates([1, 8, 15, 22, 29], {
    time: '07:00', templateSlug: 'yoga-vinyasa-mackenzie', instructorEmail: instructor.kenzie, durationMinutes: 50,
    titleOverride: 'Power Yoga', displayInstructorName: 'Kenzie',
  }),
  ...dates([6, 13, 20, 27], {
    time: '09:00', templateSlug: 'yoga-vinyasa-mackenzie', instructorEmail: instructor.kenzie, durationMinutes: 50,
    titleOverride: 'Vinyasa/Hatha Yoga', displayInstructorName: 'Kenzie',
  }),
  ...dates([10, 17, 24], {
    time: '07:00', templateSlug: 'global-hiit-mackenzie', instructorEmail: instructor.kenzie, durationMinutes: 50,
    titleOverride: 'Global Fit & Flow', displayInstructorName: 'Kenzie',
  }),
  ...dates([3], {
    time: '07:00', templateSlug: 'global-hiit-mackenzie', instructorEmail: instructor.kenzie, durationMinutes: 50,
    titleOverride: 'Global Fit & Flow', displayInstructorName: 'Kenzie',
  }),
  ...dates([14, 21, 28], {
    time: '17:10', templateSlug: 'global-hiit-mackenzie', instructorEmail: instructor.kenzie, durationMinutes: 50,
    titleOverride: 'Global Fit & Flow', displayInstructorName: 'Kenzie',
  }),
  ...dates([14, 21, 28], {
    time: '16:30', templateSlug: 'pound-mackenzie', instructorEmail: instructor.kenzie, durationMinutes: 30,
    titleOverride: 'POUND', displayInstructorName: 'Kenzie',
  }),
  ...dates([2, 9, 16, 23, 30], {
    time: '07:15', templateSlug: 'pilates-pulse-adrianna', instructorEmail: instructor.adrianna, durationMinutes: 50,
  }),
  ...dates([7], {
    time: '09:00', templateSlug: 'pilates-pulse-adrianna', instructorEmail: instructor.adrianna, durationMinutes: 50,
  }),
  ...dates([2, 9, 16, 23, 30], {
    time: '11:00', templateSlug: 'yoga-flow-adrianna', instructorEmail: instructor.adrianna, durationMinutes: 50,
    titleOverride: 'Yoga Sculpt',
  }),
  ...dates([2, 9, 16, 23, 30], {
    time: '12:00', templateSlug: 'ignite-julie', instructorEmail: instructor.julie, durationMinutes: 50,
  }),
  ...dates([14, 21, 28], {
    time: '12:00', templateSlug: 'ignite-julie', instructorEmail: instructor.julie, durationMinutes: 50,
  }),
  ...dates([1, 8, 15, 22, 29], {
    time: '11:00', templateSlug: 'rhyze-ritmo-melissa', instructorEmail: instructor.melissa, durationMinutes: 50,
  }),
  ...dates([3, 10, 17, 24], {
    time: '11:00', templateSlug: 'rhyze-ritmo-melissa', instructorEmail: instructor.melissa, durationMinutes: 50,
  }),
  ...dates([1, 3], {
    time: '19:10', templateSlug: 'rhyze-ritmo-melissa', instructorEmail: instructor.melissa, durationMinutes: 50,
  }),
  ...dates([1, 8, 15, 22, 29], {
    time: '18:00', templateSlug: 'soul-line-dancing-rachel', instructorEmail: instructor.rachel, durationMinutes: 50,
  }),
  ...dates([8, 15, 22, 29], {
    time: '19:10', templateSlug: 'rhyze-up-vanessa', instructorEmail: instructor.vanessa, durationMinutes: 50,
  }),
  ...dates([10, 17], {
    time: '19:10', templateSlug: 'rhyze-up-vanessa', instructorEmail: instructor.vanessa, durationMinutes: 50,
  }),
  ...dates([24], {
    time: '18:10', templateSlug: 'rhyze-up-vanessa', instructorEmail: instructor.vanessa, durationMinutes: 50,
  }),
  ...dates([2], {
    time: '19:10', templateSlug: 'real-riddim-dance-workout-vanessa', instructorEmail: null, durationMinutes: 50,
    titleOverride: 'Real Riddim', displayInstructorName: 'Dennisse', isSubstitute: true, plannedInstructor: 'Dennisse',
  }),
  ...dates([9, 16, 23, 30], {
    time: '19:10', templateSlug: 'real-riddim-dance-workout-vanessa', instructorEmail: instructor.vanessa, durationMinutes: 50,
  }),
  ...dates([12, 19], {
    time: '12:00', templateSlug: 'real-riddim-dance-workout-vanessa', instructorEmail: null, durationMinutes: 50,
    titleOverride: 'Real Riddim', displayInstructorName: 'Dennisse', isSubstitute: false, plannedInstructor: 'Dennisse',
  }),
  ...dates([9, 16, 23, 30], {
    time: '18:00', templateSlug: 'work-tone-mswoy36a', instructorEmail: null, durationMinutes: 50,
    displayInstructorName: 'Avery', plannedInstructor: 'Avery',
  }),
  ...dates([5, 12, 19, 26], {
    time: '11:00', templateSlug: 'work-tone-mswoy36a', instructorEmail: null, durationMinutes: 50,
    displayInstructorName: 'Avery', plannedInstructor: 'Avery',
  }),
  ...dates([17], {
    time: '18:00', templateSlug: 'heels-101-walk-with-me-nicole', instructorEmail: instructor.nicole, durationMinutes: 50,
  }),
  ...dates([14], {
    time: '19:15', templateSlug: 'tcj-hip-hop-happy-hour-tricia', instructorEmail: instructor.tricia, durationMinutes: 75,
  }),
  ...dates([18], {
    time: '18:45', templateSlug: 'seat-seduction-vanessa', instructorEmail: instructor.vanessa, durationMinutes: 75,
  }),
  ...dates([24], {
    time: '19:15', templateSlug: 'hypnotic-heels-nicole', instructorEmail: instructor.nicole, durationMinutes: 75,
  }),
  ...dates([26], {
    time: '12:00', templateSlug: 'mommy-and-me-dennisse', instructorEmail: null, durationMinutes: 45,
    plannedInstructor: 'Dennisse',
  }),
].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
