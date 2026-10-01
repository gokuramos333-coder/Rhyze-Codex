import { z } from 'zod';

export const outcomes = [
  'NOT_CONTACTED',
  'NO_ANSWER',
  'LEFT_VOICEMAIL',
  'SPOKE_WITH_CUSTOMER',
  'INTERESTED',
  'FOLLOW_UP_NEEDED',
  'WANTS_TO_JOIN_LATER',
  'NOT_INTERESTED',
  'CONVERTED',
  'DO_NOT_CONTACT',
] as const;
export const groups = [
  'ALL',
  'MEMBERS',
  'NON_MEMBERS',
  'LEADS',
  'ENGAGED',
  'ONE_CLASS',
  'REPEAT_CLASSES',
  'ONE_EVENT',
  'EVENT_NON_MEMBERS',
  'DROP_INS',
  'FORMER',
  'NO_RECENT_ATTENDANCE',
  'LOW_ENGAGEMENT',
  'OCCURRENCE_ATTENDED',
  'OCCURRENCE_BOOKED',
] as const;
export const label = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (x) => x.toUpperCase());
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')
    .toUpperCase();
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export function safeLink(value: string) {
  if (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !/[\\\r\n]/.test(value)
  )
    return true;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}
export const blockSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum([
    'heading',
    'text',
    'image',
    'button',
    'divider',
    'columns',
    'schedule',
    'event',
    'class',
  ]),
  text: z.string().max(8000).default(''),
  secondary: z.string().max(8000).default(''),
  url: z.string().max(2000).default(''),
  alt: z.string().max(300).default(''),
  occurrenceId: z.string().max(100).optional(),
  fontSize: z.number().int().min(12).max(48).default(16),
  weight: z.enum(['normal', 'bold']).default('normal'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  padding: z.number().int().min(0).max(48).default(16),
  color: color.default('#171717'),
  background: color.default('#ffffff'),
  imagePosition: z.enum(['center', 'top', 'bottom']).default('center'),
  imageHeight: z.number().int().min(100).max(800).default(280),
});
export const documentSchema = z.object({
  version: z.literal(1),
  font: z
    .enum(['Arial', 'Georgia', 'Verdana', 'Trebuchet MS'])
    .default('Arial'),
  background: color.default('#f4f0df'),
  accent: color.default('#ff5c45'),
  blocks: z.array(blockSchema).min(1).max(40),
  deadline: z.string().max(60).optional(),
});
export type NewsletterDocument = z.infer<typeof documentSchema>;
export type Block = z.infer<typeof blockSchema>;
export const audienceSchema = z.object({
  groups: z.array(z.enum(groups)).min(1).max(15),
  days: z.number().int().min(1).max(365).default(30),
  recentAttendance: z.boolean().default(false),
  excludeBooked: z.string().max(100).default(''),
  occurrenceId: z.string().max(100).default(''),
  assignedToId: z.string().max(100).default(''),
  outcome: z.string().max(50).default(''),
});
export type Audience = z.infer<typeof audienceSchema>;
export const defaultAudience = () => audienceSchema.parse({ groups: ['ALL'] });
export type ScheduleItem = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  instructor: string;
  instructorPhoto?: string;
  category?: string;
  description: string;
  image: string;
  isEvent: boolean;
  status: string;
  available: number | null;
  href: string;
};
export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  membership: string;
  activeMember: boolean;
  formerMember: boolean;
  classAttendance: number;
  eventAttendance: number;
  recentAttendance: number;
  bookings: number;
  lastAttendance: string | null;
  bookedIds: string[];
  attendedIds: string[];
  signals: string[];
  strongSignals: number;
  recordedOpens: number;
  consent: string;
  consentSource: string;
  doNotContact: boolean;
  suppression: string | null;
  accountStatus: string;
  outcome: string;
  assignedToId: string;
  followUpAt: string | null;
  lastContactedAt: string | null;
  version: number;
  attempts: number;
  lastStaff: string;
  lastInitials: string;
};
export function matchesAudience(c: Customer, a: Audience) {
  const group: Record<(typeof groups)[number], boolean> = {
    ALL: true,
    MEMBERS: c.activeMember,
    NON_MEMBERS: !c.activeMember,
    LEADS: !c.activeMember,
    ENGAGED: !c.activeMember && (c.strongSignals > 0 || c.recordedOpens > 0),
    ONE_CLASS: c.classAttendance === 1,
    REPEAT_CLASSES: !c.activeMember && c.classAttendance > 1,
    ONE_EVENT: c.eventAttendance === 1,
    EVENT_NON_MEMBERS: !c.activeMember && c.eventAttendance > 0,
    DROP_INS: !c.activeMember && c.classAttendance > 0,
    FORMER: c.formerMember,
    NO_RECENT_ATTENDANCE: c.recentAttendance === 0,
    LOW_ENGAGEMENT: c.strongSignals === 0 && c.recordedOpens === 0,
    OCCURRENCE_ATTENDED:
      !!a.occurrenceId && c.attendedIds.includes(a.occurrenceId),
    OCCURRENCE_BOOKED: !!a.occurrenceId && c.bookedIds.includes(a.occurrenceId),
  };
  return (
    a.groups.some((g) => group[g]) &&
    (!a.recentAttendance || c.recentAttendance > 0) &&
    (!a.assignedToId || c.assignedToId === a.assignedToId) &&
    (!a.outcome || c.outcome === a.outcome)
  );
}
export function eligibility(c: Customer, a?: Audience) {
  if (c.doNotContact) return 'Do not contact';
  if (c.suppression) return c.suppression;
  if (c.accountStatus !== 'ACTIVE') return 'Account not active';
  if (c.consent !== 'OPTED_IN')
    return c.consent === 'OPTED_OUT'
      ? 'Marketing opted out'
      : 'Consent unknown — review required';
  if (!z.string().email().safeParse(normalizeEmail(c.email)).success)
    return 'Invalid email';
  if (a?.excludeBooked && c.bookedIds.includes(a.excludeBooked))
    return 'Already registered';
  return null;
}
export function resolveAudience(customers: Customer[], a: Audience) {
  const matched = customers.filter((c) => matchesAudience(c, a));
  const blockedEmails = new Map<string, string>();
  for (const c of customers) {
    const reason = eligibility(c);
    if (reason && c.email) blockedEmails.set(normalizeEmail(c.email), reason);
  }
  const seen = new Set<string>();
  const entries = matched.map((customer) => {
    const email = normalizeEmail(customer.email);
    const reason =
      eligibility(customer, a) ||
      blockedEmails.get(email) ||
      (seen.has(email) ? 'Duplicate email' : null);
    if (!reason) seen.add(email);
    return { customer, email, reason: reason || null };
  });
  return {
    matching: matched.length,
    eligible: entries.filter((e) => !e.reason),
    excluded: entries.filter((e) => e.reason),
    entries,
  };
}
export function localDate(value: Date, zone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
export function addDays(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function defaultWeek(sendAt: Date) {
  const date = localDate(sendAt);
  const day = new Date(date + 'T12:00:00Z').getUTCDay();
  return addDays(date, day === 0 ? 1 : 1 - day);
}
export function localSendCandidates(local: string, zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return [];
  const naive = Date.parse(local + 'Z');
  if (!Number.isFinite(naive)) return [];
  const f = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const candidates: string[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const date = new Date(naive + offset * 60000);
    if (f.format(date).replace(' ', 'T') === local)
      candidates.push(date.toISOString());
  }
  return candidates;
}
export function resolveSendTime(
  local: string,
  zone: string,
  chosen: string | undefined,
  now = new Date(),
) {
  const c = localSendCandidates(local, zone);
  if (!c.length)
    throw Error('This local time does not exist. Choose a valid date/time.');
  if (c.length > 1 && !chosen)
    throw Error(
      'This time occurs twice because of daylight saving. Choose its UTC offset.',
    );
  const v = chosen || c[0];
  if (!c.includes(v))
    throw Error('The selected offset does not match this local time.');
  if (new Date(v) <= now) throw Error('Choose a future send time.');
  return new Date(v);
}
export function weekBounds(week: string) {
  const candidates = localSendCandidates(week + 'T00:00', 'America/New_York');
  if (!candidates.length) throw Error('Invalid week');
  return {
    gte: new Date(candidates[0]),
    lt: new Date(
      localSendCandidates(addDays(week, 7) + 'T00:00', 'America/New_York')[0],
    ),
  };
}
export function materialChanges(before: ScheduleItem[], after: ScheduleItem[]) {
  const next = new Map(after.map((x) => [x.id, x]));
  return before.flatMap((x) => {
    const n = next.get(x.id);
    if (!n || n.status !== 'SCHEDULED')
      return [`${x.title}: cancelled or unavailable`];
    if (
      n.startAt !== x.startAt ||
      n.endAt !== x.endAt ||
      n.instructor !== x.instructor ||
      n.title !== x.title
    )
      return [`${x.title}: time, title or instructor changed`];
    return [];
  });
}
export function formatScheduleDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}
export function validateContent(input: {
  subject: string;
  document: NewsletterDocument;
  type: string;
  schedule: ScheduleItem[];
  sender: string;
  replyTo: string;
  postalAddress: string;
  googleReviewUrl: string;
  now?: Date;
}) {
  const errors: string[] = [];
  const now = input.now || new Date();
  if (!input.subject.trim()) errors.push('Add a subject.');
  if (!input.sender) errors.push('Configure the verified sender.');
  if (!z.string().email().safeParse(input.replyTo).success)
    errors.push('Configure a reply-to email.');
  if (!input.postalAddress.trim())
    errors.push('Add the studio postal address.');
  const copy = [
    input.subject,
    ...input.document.blocks.flatMap((b) => [b.text, b.secondary, b.url]),
  ].join(' ');
  if (
    /\[.+?\]|\{\{(?!first_name\}\})[^}]+\}\}|Add the details|Add your|Add the current|Share an approved|add its approved|replace this|edit this/i.test(
      copy,
    )
  )
    errors.push('Resolve all placeholder copy and links.');
  for (const b of input.document.blocks) {
    if (['button', 'image'].includes(b.type) && (!b.url || !safeLink(b.url)))
      errors.push(
        `Add a valid ${b.type === 'button' ? 'button link' : 'image URL'}.`,
      );
    if (b.type === 'image' && !b.alt.trim()) errors.push('Add image alt text.');
    if (['event', 'class'].includes(b.type)) {
      const x = input.schedule.find((x) => x.id === b.occurrenceId);
      if (!x || x.status !== 'SCHEDULED' || new Date(x.endAt) <= now)
        errors.push(
          'A featured class/event is cancelled, past or unavailable.',
        );
    }
    if (
      b.type === 'schedule' &&
      !input.schedule.some(
        (x) => x.status === 'SCHEDULED' && new Date(x.endAt) > now,
      )
    )
      errors.push('The selected week has no upcoming scheduled sessions.');
  }
  if (input.type === 'REVIEW' && !safeLink(input.googleReviewUrl))
    errors.push('Add a verified Google review URL in Email Settings.');
  if (input.type.includes('24_HOURS')) {
    const t = Date.parse(input.document.deadline || '');
    if (
      !Number.isFinite(t) ||
      t <= now.getTime() ||
      t - now.getTime() > 24 * 3600000 ||
      input.schedule.some(
        (x) =>
          input.document.blocks.some((b) => b.occurrenceId === x.id) &&
          t > new Date(x.startAt).getTime(),
      )
    )
      errors.push(
        '24-hours copy requires a real deadline within the next 24 hours.',
      );
  }
  if (
    input.document.deadline &&
    (!Number.isFinite(Date.parse(input.document.deadline)) ||
      Date.parse(input.document.deadline) <= now.getTime())
  )
    errors.push('This promotion or deadline has expired.');
  if (
    input.type === 'LIMITED_SPOTS' &&
    !input.schedule.some(
      (x) =>
        input.document.blocks.some(
          (b) => ['class', 'event'].includes(b.type) && b.occurrenceId === x.id,
        ) &&
        x.status === 'SCHEDULED' &&
        x.available !== null &&
        x.available > 0 &&
        x.available <= 5,
    )
  )
    errors.push(
      'Limited-spots copy requires confirmed availability of 1–5 places in a featured session.',
    );
  return [...new Set(errors)];
}
export function csvCell(value: unknown) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}

export function easternDate(value: Date | string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export function qualifyingCampaignLink(
  link: string | null,
  site: string,
  campaignId: string,
  kind: 'schedule' | 'memberships',
) {
  if (!link) return false;
  try {
    const u = new URL(link, site);
    return (
      u.origin === new URL(site).origin &&
      u.searchParams.get('utm_campaign') === campaignId &&
      new RegExp(
        kind === 'schedule'
          ? '^/(schedule|classes|events|book)(/|$)'
          : '^/(memberships|shop)(/|$)',
      ).test(u.pathname)
    );
  } catch {
    return false;
  }
}
