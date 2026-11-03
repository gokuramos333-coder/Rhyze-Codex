import { createHash } from 'node:crypto';
import type { PrismaClient, Prisma } from '@prisma/client';
import { queueEmail } from '@/lib/notifications/email-queue';
import {
  csvCell,
  documentSchema,
  eligibility,
  type Customer,
} from '@/lib/newsletters/domain';

export const ABSENCE_TEMPLATE = 'MEMBER_ABSENCE';
export const ABSENCE_OWNERS = ['vanessa@rhyzefit.com', 'melissa@rhyzefit.com'];
const WEEK = 7 * 86400000;
export function absenceRunDay(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)?.value;
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
  };
}
export function absenceKey(userId: string, attendanceId: string) {
  return (
    'absence-' +
    createHash('sha256').update(`${userId}:${attendanceId}`).digest('hex')
  );
}
export const absenceDocument = documentSchema.parse({
  version: 1,
  blocks: [
    { id: 'hello', type: 'heading', text: 'We miss you, Rhyze Tribe!' },
    {
      id: 'note',
      type: 'text',
      text: 'It’s been a little while since your last class, and we’d love to see you again. Make a little time for yourself this week—your Rhyze Tribe is here for you. Browse the schedule to book your next class, or reply and we’ll help you find the right one.',
    },
    {
      id: 'book',
      type: 'button',
      text: 'Find my next class',
      url: '/schedule',
    },
  ],
});

export async function loadAbsenceMembers(
  db: PrismaClient | Prisma.TransactionClient,
  now: Date,
) {
  const people = await db.user.findMany({
    where: {
      role: 'MEMBER',
      status: 'ACTIVE',
      NOT: { email: { endsWith: '@rhyze.local' } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      memberProfile: { select: { phone: true } },
      attendanceRecords: {
        where: {
          status: { in: ['ATTENDED', 'CHECKED_IN'] },
          occurrence: { startAt: { lte: now }, template: { isEvent: false } },
        },
      },
      bookings: {
        where: {
          status: 'CONFIRMED',
          occurrence: {
            status: 'SCHEDULED',
            archivedAt: null,
            startAt: { gt: now },
          },
        },
        select: { id: true },
      },
    },
  });
  // Order by the actual class visit, not the date a staff member later edited attendance.
  const records = await db.classOccurrence.findMany({
    where: {
      id: {
        in: people.flatMap((p) =>
          p.attendanceRecords.map((a) => a.occurrenceId),
        ),
      },
    },
    select: { id: true, startAt: true },
  });
  const dates = new Map(records.map((r) => [r.id, r.startAt]));
  return people.flatMap((p) => {
    const visits = p.attendanceRecords
      .map((a) => ({ id: a.id, at: dates.get(a.occurrenceId)! }))
      .sort((a, b) => +b.at - +a.at || a.id.localeCompare(b.id));
    const last = visits[0];
    if (!last || +now - +last.at < WEEK) return [];
    return [
      {
        id: p.id,
        name: p.name || 'Member',
        email: p.email,
        phone: p.memberProfile?.phone || '',
        lastAttendanceId: last.id,
        lastAt: last.at,
        days: Math.floor((+now - +last.at) / 86400000),
        upcoming: p.bookings.length,
      },
    ];
  });
}

type AbsenceSnapshot = {
  absence?: { userId: string; attendanceId: string; lastAt: string };
};
export async function absenceStillDeliverable(
  db: PrismaClient | Prisma.TransactionClient,
  snapshot: unknown,
  now = new Date(),
) {
  const a = (snapshot as AbsenceSnapshot | null)?.absence;
  if (!a) return false;
  const people = await loadAbsenceMembers(db, now);
  return people.some(
    (p) =>
      p.id === a.userId &&
      p.lastAttendanceId === a.attendanceId &&
      p.lastAt.toISOString() === a.lastAt &&
      !p.upcoming,
  );
}

export async function prepareAbsenceFollowUp(
  db: PrismaClient,
  input: {
    now: Date;
    enabledAt: Date;
    customers: Customer[];
    origin: string;
    sender: string;
    replyTo: string;
    postalAddress: string;
    outreachEnabled: boolean;
  },
) {
  const day = absenceRunDay(input.now).day;
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rhyze-member-absence'))`;
      const reportKeys = ABSENCE_OWNERS.map(
        (to) => `absence-report:${day}:${to}`,
      );
      const alreadyQueued = await tx.emailMessage.count({
        where: { dedupeKey: { in: reportKeys } },
      });
      if (alreadyQueued === reportKeys.length)
        return {
          alreadyPrepared: true,
          members: 0,
          queued: 0,
          ownerReports: 0,
        };
      if (alreadyQueued)
        throw Error(
          'Incomplete daily absence report; review required before retry',
        );
      const owner = await tx.user.findFirst({
        where: {
          role: 'OWNER',
          status: 'ACTIVE',
          email: { in: ABSENCE_OWNERS },
        },
        select: { id: true },
      });
      if (!owner) throw Error('Approved absence-report owner unavailable');
      const members = await loadAbsenceMembers(tx, input.now);
      let queued = 0;
      const rows = [];
      for (const member of members) {
        const customers = input.customers.filter(
          (c) =>
            c.email.trim().toLowerCase() === member.email.trim().toLowerCase(),
        );
        const reason = !customers.length
          ? 'Email eligibility unavailable'
          : customers.map((c) => eligibility(c)).find(Boolean);
        const id = absenceKey(member.id, member.lastAttendanceId);
        const existing = await tx.emailCampaign.findUnique({
          where: { id },
          select: {
            recipients: { select: { status: true, exclusionReason: true } },
          },
        });
        const recorded = existing?.recipients[0];
        const deliveryStatus =
          recorded?.status === 'ACCEPTED'
            ? 'Email accepted by provider (delivery not confirmed)'
            : recorded?.status === 'EXCLUDED'
              ? `Email not sent: ${recorded.exclusionReason || 'recipient excluded'}`
              : recorded?.status === 'CAPTURED'
                ? 'Test capture only — no email sent'
                : recorded
                  ? `Email ${recorded.status.toLowerCase()}`
                  : 'Existing outreach needs review';
        let action =
          reason ||
          (member.upcoming
            ? 'Already booked to return'
            : existing
              ? deliveryStatus
              : +member.lastAt + WEEK < +input.enabledAt
                ? 'Historical absence — staff follow-up'
                : !input.outreachEnabled
                  ? 'Automatic outreach paused'
                  : 'Email queued');
        if (
          !existing &&
          !reason &&
          !member.upcoming &&
          +member.lastAt + WEEK >= +input.enabledAt &&
          input.outreachEnabled
        ) {
          const snapshot = {
            subject: 'We miss you at Rhyze 💛',
            previewText: 'Let’s make time for your next class.',
            document: absenceDocument,
            schedule: [],
            sender: input.sender,
            replyTo: input.replyTo,
            postalAddress: input.postalAddress,
            targetWeek: '',
            origin: input.origin,
            absence: {
              userId: member.id,
              attendanceId: member.lastAttendanceId,
              lastAt: member.lastAt.toISOString(),
            },
          };
          await tx.emailCampaign.create({
            data: {
              id,
              createdById: owner.id,
              name: 'We miss you — one message per absence',
              subject: snapshot.subject,
              previewText: snapshot.previewText,
              body: JSON.stringify(absenceDocument),
              segment: 'NEWSLETTER_V1',
              templateType: ABSENCE_TEMPLATE,
              status: 'SENDING',
              scheduledFor: input.now,
              approvedById: owner.id,
              approvedAt: input.now,
              approvedVersion: 1,
              document: absenceDocument,
              recipientCount: 1,
              sentSnapshot: snapshot,
              recipients: {
                create: {
                  userId: member.id,
                  email: member.email.trim().toLowerCase(),
                  firstName: member.name.split(' ')[0],
                  membershipAtSend: customers[0].membership,
                  nextAttemptAt: input.now,
                },
              },
            },
          });
          queued++;
          action = 'Email queued';
        }
        rows.push([
          member.name,
          member.email,
          member.phone,
          member.lastAt.toISOString(),
          member.days,
          member.upcoming,
          action,
        ]);
      }
      const csv = [
        [
          'Member',
          'Email',
          'Phone',
          'Last attended class (UTC)',
          'Days absent',
          'Upcoming bookings',
          'Follow-up status',
        ],
        ...rows,
      ]
        .map((r) => r.map(csvCell).join(','))
        .join('\r\n');
      for (const to of ABSENCE_OWNERS)
        await queueEmail(tx, {
          to,
          subject: `Rhyze daily follow-up — ${day}`,
          template: 'ADMIN_ABSENCE_REPORT',
          payload: {
            date: day,
            count: String(members.length),
            queued: String(queued),
          },
          dedupeKey: `absence-report:${day}:${to}`,
          scheduledFor: input.now,
          attachments: [
            {
              filename: `rhyze-absence-${day}.csv`,
              contentType: 'text/csv',
              content: Buffer.from(csv),
            },
          ],
        });
      return { members: members.length, queued, ownerReports: 2 };
    },
    { timeout: 60000 },
  );
}
