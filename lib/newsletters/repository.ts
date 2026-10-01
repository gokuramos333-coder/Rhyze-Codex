import { Prisma } from '@prisma/client';
import { publicScheduleDetailHref } from '@/lib/domain/schedule/public-calendar';
import { resolvePublicInstructorPhoto } from '@/lib/domain/schedule/public-instructor-photo';
import { prisma } from '@/lib/db/prisma';
import { isQualifyingActiveMembership } from '@/lib/domain/memberships/active-membership';
import {
  occurrenceInstructorName,
  occurrenceTitle,
} from '@/lib/domain/schedule/occurrence-management';
import {
  type Customer,
  type ScheduleItem,
  normalizeEmail,
  weekBounds,
  initials,
} from './domain';
export const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export const origin = () =>
  new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://www.rhyzefitness.com')
    .origin;
export function captureEnabled() {
  if (process.env.NEWSLETTER_CAPTURE !== 'true') return false;
  const db = new URL(process.env.DATABASE_URL || 'http://invalid');
  const site = new URL(origin());
  return (
    ['localhost', '127.0.0.1'].includes(db.hostname) &&
    ['localhost', '127.0.0.1'].includes(site.hostname) &&
    db.pathname === '/rhyze_newsletter_preview'
  );
}
export async function settings() {
  const stored = await prisma.newsletterSettings.findUnique({
    where: { id: 'studio' },
  });
  return (
    stored || {
      id: 'studio',
      version: 0,
      replyTo: process.env.EMAIL_REPLY_TO || '',
      postalAddress:
        'The Shoppes at Lafayette, 75 NJ-15, Building J, Lafayette Township, NJ 07848',
      googleReviewUrl: '',
      engagementDays: 30,
      attributionDays: 7,
      opensSupported: false,
      clicksSupported: false,
      updatedAt: new Date(),
    }
  );
}
export async function audit(
  actorId: string | null,
  action: string,
  id: string | null,
  after: unknown,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  await client.auditLog.create({
    data: {
      actorId,
      action: 'NEWSLETTER_' + action,
      entityType: 'Newsletter',
      entityId: id,
      after: json(after),
    },
  });
}
export async function loadCustomers(
  days = 30,
  includeSubscribers = false,
): Promise<Customer[]> {
  const since = new Date(Date.now() - days * 86400000);
  const [users, suppressions, subscriptions, events] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'MEMBER', NOT: { email: { endsWith: '@rhyze.local' } } },
      include: {
        memberProfile: true,
        memberships: { include: { product: true } },
        notificationPreference: true,
        leadProfile: true,
        attendanceRecords: {
          include: { occurrence: { include: { template: true } } },
        },
        bookings: { include: { occurrence: { include: { template: true } } } },
        outreachEntries: { orderBy: { occurredAt: 'desc' } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.marketingSuppression.findMany(),
    prisma.newsletterLead.findMany(),
    prisma.newsletterEvent.findMany({
      where: {
        occurredAt: { gte: since },
        type: { in: ['email.opened', 'email.clicked'] },
      },
      include: { recipient: { select: { userId: true, email: true } } },
    }),
  ]);
  const suppressed = new Map(suppressions.map((x) => [x.email, x.reason]));
  const subscribed = new Set(subscriptions.map((x) => normalizeEmail(x.email)));
  const list: Customer[] = users.map((u) => {
    const p = u.leadProfile;
    const attended = u.attendanceRecords.filter((a) =>
      ['ATTENDED', 'CHECKED_IN'].includes(a.status),
    );
    const recent = attended.filter(
      (a) => (a.checkedInAt || a.occurrence.startAt) >= since,
    );
    const active = u.memberships.some(
      (m) =>
        isQualifyingActiveMembership({
          status: m.status,
          productKind: m.product.kind,
        }) &&
        (!m.currentPeriodEnd || m.currentPeriodEnd > new Date()),
    );
    const validBookings = u.bookings.filter(
      (b) =>
        ['CONFIRMED', 'ATTENDED'].includes(b.status) &&
        b.occurrence.status !== 'CANCELLED',
    );
    const recentBookings = validBookings.filter((b) => b.bookedAt >= since);
    const engagement = events.filter(
      (e) => e.recipient.userId === u.id && e.automated !== true,
    );
    const clicks = engagement.filter((e) => e.type === 'email.clicked');
    const opens = engagement.filter((e) => e.type === 'email.opened');
    const signals = [
      ...(clicks.length
        ? [
            `${clicks.length} recorded link click${clicks.length === 1 ? '' : 's'} in ${days} days`,
          ]
        : []),
      ...(recent.length
        ? [
            `Attended ${recent.length} session${recent.length === 1 ? '' : 's'} in ${days} days`,
          ]
        : []),
      ...(recentBookings.length > 1
        ? [`${recentBookings.length} active/recent bookings`]
        : []),
      ...(opens.length
        ? [`${opens.length} recorded opens (may be automated)`]
        : []),
    ];
    const outreach = u.outreachEntries.filter((e) => e.type === 'OUTREACH');
    let consent = p?.consent || 'UNKNOWN';
    let source = p?.consentSource || '';
    if (u.notificationPreference?.marketingEmail === false) {
      consent = 'OPTED_OUT';
      source = 'Customer email preferences';
    } else if (
      consent === 'UNKNOWN' &&
      subscribed.has(normalizeEmail(u.email))
    ) {
      consent = 'OPTED_IN';
      source = 'Existing newsletter signup';
    }
    return {
      id: u.id,
      name: u.name || 'Customer',
      email: u.email,
      phone: u.memberProfile?.phone || '',
      membership: active
        ? 'Active member'
        : u.memberships.length
          ? 'Former / expired member'
          : 'Non-member',
      activeMember: active,
      formerMember: !active && u.memberships.length > 0,
      classAttendance: attended.filter((a) => !a.occurrence.template.isEvent)
        .length,
      eventAttendance: attended.filter((a) => a.occurrence.template.isEvent)
        .length,
      recentAttendance: recent.length,
      bookings: validBookings.length,
      lastAttendance:
        attended
          .map((a) => (a.checkedInAt || a.occurrence.startAt).toISOString())
          .sort()
          .at(-1) || null,
      bookedIds: validBookings.map((b) => b.occurrenceId),
      attendedIds: attended.map((a) => a.occurrenceId),
      signals,
      strongSignals:
        clicks.length +
        recent.length +
        (recentBookings.length > 1 ? recentBookings.length : 0),
      recordedOpens: opens.length,
      consent,
      consentSource: source,
      doNotContact: p?.doNotContact || false,
      suppression: suppressed.get(normalizeEmail(u.email)) || null,
      accountStatus: u.status,
      outcome: p?.outcome || 'NOT_CONTACTED',
      assignedToId: p?.assignedToId || '',
      followUpAt: p?.followUpAt?.toISOString() || null,
      lastContactedAt: p?.lastContactedAt?.toISOString() || null,
      version: p?.version || 0,
      attempts: outreach.length,
      lastStaff: outreach[0]?.actorName || '',
      lastInitials: outreach[0]?.actorInitials || '',
    };
  });
  if (includeSubscribers) {
    const emails = new Set(list.map((x) => normalizeEmail(x.email)));
    for (const sub of subscriptions) {
      const email = normalizeEmail(sub.email);
      if (emails.has(email)) continue;
      list.push({
        id: 'subscriber:' + sub.id,
        name: 'Newsletter subscriber',
        email,
        phone: '',
        membership: 'No account',
        activeMember: false,
        formerMember: false,
        classAttendance: 0,
        eventAttendance: 0,
        recentAttendance: 0,
        bookings: 0,
        lastAttendance: null,
        bookedIds: [],
        attendedIds: [],
        signals: [],
        strongSignals: 0,
        recordedOpens: 0,
        consent: 'OPTED_IN',
        consentSource: 'Existing newsletter signup',
        doNotContact: false,
        suppression: suppressed.get(email) || null,
        accountStatus: 'ACTIVE',
        outcome: 'NOT_CONTACTED',
        assignedToId: '',
        followUpAt: null,
        lastContactedAt: null,
        version: 0,
        attempts: 0,
        lastStaff: '',
        lastInitials: '',
      });
    }
  }
  return list;
}
export async function loadSchedule(
  week: string,
  ids: string[] = [],
): Promise<ScheduleItem[]> {
  const bounds = weekBounds(week);
  const list = await prisma.classOccurrence.findMany({
    where: {
      OR: [{ startAt: bounds }, ...(ids.length ? [{ id: { in: ids } }] : [])],
    },
    include: {
      template: { include: { category: true } },
      instructor: { include: { instructorProfile: true } },
      bookings: { where: { status: { in: ['CONFIRMED', 'ATTENDED'] } } },
    },
    orderBy: { startAt: 'asc' },
  });
  return list.map((x) => ({
    id: x.id,
    title: occurrenceTitle(x),
    startAt: x.startAt.toISOString(),
    endAt: x.endAt.toISOString(),
    instructor: occurrenceInstructorName(x),
    instructorPhoto: resolvePublicInstructorPhoto({
      assignedInstructorName: x.instructor?.name || '',
      displayInstructorName: occurrenceInstructorName(x),
      assignedProfile: x.instructor?.instructorProfile,
    }),
    category: x.template.category.name,
    description: x.publicNotes || x.template.description,
    image: x.imageUrl || x.template.imageUrl || '',
    isEvent: x.template.isEvent,
    status: x.status,
    available: Math.max(
      0,
      x.capacity - Math.max(x.bookings.length, x.historicalSignupCount),
    ),
    href: publicScheduleDetailHref({
      occurrenceId: x.id,
      templateSlug: x.template.slug,
      isEvent: x.template.isEvent,
    }),
  }));
}
export async function staff() {
  return prisma.user.findMany({
    where: { status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN', 'MANAGER'] } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
export async function timeline(userId: string) {
  return prisma.customerOutreach.findMany({
    where: { userId },
    orderBy: { occurredAt: 'desc' },
  });
}
export async function logOutreach(
  actor: { id: string; name: string | null; email: string },
  input: {
    userId: string;
    version: number;
    operationKey: string;
    type: 'OUTREACH' | 'STATUS' | 'NOTE';
    method?: 'TEXT' | 'CALL';
    outcome?: string;
    note?: string;
    followUpAt?: string | null;
    assignedToId?: string | null;
  },
) {
  return prisma.$transaction(
    async (tx) => {
      const duplicate = await tx.customerOutreach.findUnique({
        where: { operationKey: input.operationKey },
      });
      if (duplicate) {
        if (duplicate.userId !== input.userId || duplicate.actorId !== actor.id)
          throw Error('Operation belongs to another record.');
        return duplicate;
      }
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, role: true },
      });
      if (!user || user.role !== 'MEMBER') throw Error('Customer not found.');
      const p = await tx.customerLeadProfile.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId },
        update: {},
      });
      if (p.version !== input.version)
        throw Error(
          'Another staff member updated this customer. Reload the timeline before saving.',
        );
      if (input.type === 'OUTREACH' && p.doNotContact)
        throw Error(
          'Do Not Contact: outreach logging is blocked until the preference is reviewed.',
        );
      if (
        input.assignedToId &&
        !(await tx.user.findFirst({
          where: {
            id: input.assignedToId,
            role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
            status: 'ACTIVE',
          },
        }))
      )
        throw Error('Choose active staff.');
      const updated = await tx.customerLeadProfile.updateMany({
        where: { userId: input.userId, version: input.version },
        data: {
          version: { increment: 1 },
          ...(input.outcome
            ? {
                outcome: input.outcome,
                doNotContact:
                  input.outcome === 'DO_NOT_CONTACT' ? true : p.doNotContact,
              }
            : {}),
          ...(input.followUpAt !== undefined
            ? {
                followUpAt: input.followUpAt
                  ? new Date(input.followUpAt)
                  : null,
              }
            : {}),
          ...(input.assignedToId !== undefined
            ? { assignedToId: input.assignedToId || null }
            : {}),
          ...(input.type === 'OUTREACH' ? { lastContactedAt: new Date() } : {}),
        },
      });
      if (!updated.count)
        throw Error('Concurrent update. Reload before saving.');
      const attempt =
        input.type === 'OUTREACH'
          ? (await tx.customerOutreach.count({
              where: {
                userId: input.userId,
                type: 'OUTREACH',
                method: input.method,
              },
            })) + 1
          : null;
      const name = actor.name || actor.email;
      const entry = await tx.customerOutreach.create({
        data: {
          userId: input.userId,
          actorId: actor.id,
          actorName: name,
          actorInitials: initials(name),
          type: input.type,
          method: input.type === 'OUTREACH' ? input.method : null,
          attempt,
          outcome: input.outcome,
          note: input.note || null,
          operationKey: input.operationKey,
        },
      });
      await audit(
        actor.id,
        'OUTREACH_' + input.type,
        input.userId,
        { entryId: entry.id, method: entry.method, attempt },
        tx,
      );
      return entry;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
