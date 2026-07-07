export type SlotStatus = 'open' | 'waitlist' | 'full';
export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type ScheduleSlot = {
  day: Day;
  time: string;
  classSlug: string;
  className: string;
  instructor: 'Vanessa' | 'Melissa';
  status: SlotStatus;
};

export const days: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const statusLabel: Record<SlotStatus, string> = {
  open: 'Open to Book',
  waitlist: 'Waiting List',
  full: 'Booked & Full',
};

export const statusStyles: Record<SlotStatus, string> = {
  open: 'bg-level-foundation/20 text-level-foundation border-level-foundation/40',
  waitlist: 'bg-rhyze-gold/20 text-rhyze-gold border-rhyze-gold/40',
  full: 'bg-rhyze-coral/20 text-rhyze-coral border-rhyze-coral/40',
};

// Weekly schedule. Mon-Fri 7 AM - 8 PM · Sat-Sun 8 AM - 2 PM.
export const schedule: ScheduleSlot[] = [
  // Monday
  { day: 'Mon', time: '7:00 AM', classSlug: 'the-daily-rhyze', className: 'The Daily Rhyze', instructor: 'Vanessa', status: 'open' },
  { day: 'Mon', time: '9:30 AM', classSlug: 'rhyze-and-align', className: 'Rhyze & Align', instructor: 'Melissa', status: 'open' },
  { day: 'Mon', time: '12:15 PM', classSlug: 'afternoon-rhyze', className: 'Afternoon Rhyze', instructor: 'Melissa', status: 'waitlist' },
  { day: 'Mon', time: '5:30 PM', classSlug: 'rhyze-and-groove', className: 'Rhyze & Groove', instructor: 'Vanessa', status: 'full' },
  { day: 'Mon', time: '6:45 PM', classSlug: 'power-rhyze', className: 'Power Rhyze', instructor: 'Vanessa', status: 'open' },
  // Tuesday
  { day: 'Tue', time: '7:00 AM', classSlug: 'rhyze-and-grind', className: 'Rhyze & Grind', instructor: 'Vanessa', status: 'open' },
  { day: 'Tue', time: '9:30 AM', classSlug: 'core-rhyze', className: 'Core Rhyze', instructor: 'Melissa', status: 'open' },
  { day: 'Tue', time: '5:30 PM', classSlug: 'ritmo-rhyze', className: 'Rhyze Ritmo', instructor: 'Melissa', status: 'full' },
  { day: 'Tue', time: '6:45 PM', classSlug: 'zen-rhyze', className: 'Zen Rhyze', instructor: 'Melissa', status: 'open' },
  // Wednesday
  { day: 'Wed', time: '7:00 AM', classSlug: 'the-daily-rhyze', className: 'The Daily Rhyze', instructor: 'Vanessa', status: 'open' },
  { day: 'Wed', time: '12:15 PM', classSlug: 'afternoon-rhyze', className: 'Afternoon Rhyze', instructor: 'Melissa', status: 'open' },
  { day: 'Wed', time: '5:30 PM', classSlug: 'rhyze-revolution', className: 'Rhyze Revolution', instructor: 'Vanessa', status: 'waitlist' },
  { day: 'Wed', time: '6:45 PM', classSlug: 'limitless-rhyze', className: 'Limitless Rhyze', instructor: 'Vanessa', status: 'open' },
  // Thursday
  { day: 'Thu', time: '7:00 AM', classSlug: 'rhyze-to-the-challenge', className: 'Rhyze to the Challenge', instructor: 'Vanessa', status: 'open' },
  { day: 'Thu', time: '9:30 AM', classSlug: 'rhyze-and-align', className: 'Rhyze & Align', instructor: 'Melissa', status: 'open' },
  { day: 'Thu', time: '5:30 PM', classSlug: 'rhyze-and-groove', className: 'Rhyze & Groove', instructor: 'Vanessa', status: 'waitlist' },
  { day: 'Thu', time: '6:45 PM', classSlug: 'core-rhyze', className: 'Core Rhyze', instructor: 'Melissa', status: 'open' },
  // Friday
  { day: 'Fri', time: '7:00 AM', classSlug: 'the-daily-rhyze', className: 'The Daily Rhyze', instructor: 'Vanessa', status: 'open' },
  { day: 'Fri', time: '12:15 PM', classSlug: 'ritmo-rhyze', className: 'Rhyze Ritmo', instructor: 'Melissa', status: 'full' },
  { day: 'Fri', time: '5:30 PM', classSlug: 'rhyze-and-grind', className: 'Rhyze & Grind', instructor: 'Vanessa', status: 'open' },
  { day: 'Fri', time: '6:45 PM', classSlug: 'zen-rhyze', className: 'Zen Rhyze', instructor: 'Melissa', status: 'open' },
  // Saturday
  { day: 'Sat', time: '8:30 AM', classSlug: 'rhyze-and-groove', className: 'Rhyze & Groove', instructor: 'Vanessa', status: 'full' },
  { day: 'Sat', time: '10:00 AM', classSlug: 'power-rhyze', className: 'Power Rhyze', instructor: 'Vanessa', status: 'waitlist' },
  { day: 'Sat', time: '11:30 AM', classSlug: 'ritmo-rhyze', className: 'Rhyze Ritmo', instructor: 'Melissa', status: 'open' },
  // Sunday
  { day: 'Sun', time: '9:00 AM', classSlug: 'rhyze-and-align', className: 'Rhyze & Align', instructor: 'Melissa', status: 'open' },
  { day: 'Sun', time: '10:30 AM', classSlug: 'zen-rhyze', className: 'Zen Rhyze', instructor: 'Melissa', status: 'open' },
  { day: 'Sun', time: '12:00 PM', classSlug: 'rhyze-revolution', className: 'Rhyze Revolution', instructor: 'Vanessa', status: 'waitlist' },
];

export function slotsForDay(day: Day) {
  return schedule.filter((s) => s.day === day);
}

// Preview: today + next two days
export function previewSchedule(from: Day = 'Mon'): ScheduleSlot[] {
  const startIdx = days.indexOf(from);
  const picks = [0, 1, 2]
    .map((o) => days[(startIdx + o) % 7])
    .flatMap((d) => slotsForDay(d).slice(0, 3));
  return picks;
}
