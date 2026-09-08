import { readFile } from 'node:fs/promises';
import { prisma } from '@/lib/db/prisma';
import {
  groupSombleAttendees,
  parseSombleAttendees,
} from '@/lib/import/somble';

type RosterArgument = {
  occurrenceId: string;
  filePath: string;
};

function rosterArguments(): RosterArgument[] {
  const values: RosterArgument[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== '--roster') continue;
    const value = process.argv[index + 1] || '';
    const separator = value.indexOf('::');
    if (separator < 1) {
      throw new Error('Use --roster occurrence-id::/absolute/path.csv');
    }
    values.push({
      occurrenceId: value.slice(0, separator),
      filePath: value.slice(separator + 2),
    });
  }
  return values;
}

async function main() {
  const rosters = rosterArguments();
  const apply = process.argv.includes('--apply');
  if (!rosters.length) {
    throw new Error(
      'Use --roster occurrence-id::/absolute/path.csv at least once',
    );
  }

  for (const roster of rosters) {
    const occurrence = await prisma.classOccurrence.findUnique({
      where: { id: roster.occurrenceId },
      include: { template: true },
    });
    if (!occurrence) {
      throw new Error(`Unknown occurrence: ${roster.occurrenceId}`);
    }
    const attendees = parseSombleAttendees(
      await readFile(roster.filePath, 'utf8'),
    );
    const groupedAttendees = groupSombleAttendees(attendees);
    console.info(
      `${occurrence.template.name} · ${occurrence.startAt.toISOString()} · ${attendees.length} attendees`,
    );
    if (!apply) continue;

    await prisma.$transaction(async (database) => {
      for (const { attendee, guests } of groupedAttendees) {
        const user = await database.user.upsert({
          where: { email: attendee.email },
          update: {
            ...(attendee.name ? { name: attendee.name } : {}),
          },
          create: {
            name: attendee.name,
            email: attendee.email,
            role: 'MEMBER',
            status: 'INVITED',
            memberProfile: { create: {} },
            notificationPreference: { create: {} },
          },
        });
        const booking = await database.booking.upsert({
          where: {
            occurrenceId_userId: {
              occurrenceId: occurrence.id,
              userId: user.id,
            },
          },
          update: {
            status: attendee.checkedIn ? 'ATTENDED' : 'CONFIRMED',
            source: 'SOMBLE_IMPORT',
            policySnapshot: {
              importedAccessType: attendee.accessType,
              importedGuests: guests,
              sourceFile: roster.filePath.split('/').pop(),
            },
          },
          create: {
            occurrenceId: occurrence.id,
            userId: user.id,
            status: attendee.checkedIn ? 'ATTENDED' : 'CONFIRMED',
            source: 'SOMBLE_IMPORT',
            policySnapshot: {
              importedAccessType: attendee.accessType,
              importedGuests: guests,
              sourceFile: roster.filePath.split('/').pop(),
            },
          },
        });
        if (attendee.checkedIn) {
          await database.attendanceRecord.upsert({
            where: {
              occurrenceId_userId: {
                occurrenceId: occurrence.id,
                userId: user.id,
              },
            },
            update: {
              bookingId: booking.id,
              status: 'ATTENDED',
              checkedInAt: occurrence.startAt,
            },
            create: {
              occurrenceId: occurrence.id,
              bookingId: booking.id,
              userId: user.id,
              status: 'ATTENDED',
              checkedInAt: occurrence.startAt,
            },
          });
        }
      }
      await database.booking.updateMany({
        where: {
          occurrenceId: occurrence.id,
          source: 'SOMBLE_IMPORT',
          user: {
            email: { notIn: groupedAttendees.map((item) => item.attendee.email) },
          },
        },
        data: { status: 'CANCELLED' },
      });
      await database.classOccurrence.update({
        where: { id: occurrence.id },
        data: {
          historicalSignupCount: attendees.length - groupedAttendees.length,
          capacity: 24,
        },
      });
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
