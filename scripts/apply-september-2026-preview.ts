import { PrismaClient } from '@prisma/client';
import { SEPTEMBER_2026_SCHEDULE } from '../lib/domain/schedule/september-2026-schedule';
import { parseOccurrenceLocalStart } from '../lib/domain/schedule/occurrence-management';
import { defaultInstructorPayForOccurrence } from '../lib/domain/instructors/pay-rates';

const prisma = new PrismaClient();
const SEPTEMBER_START = new Date('2026-09-01T04:00:00.000Z');
const OCTOBER_START = new Date('2026-10-01T04:00:00.000Z');
const MOMMY_SLUG = 'mommy-and-me-dennisse';

function assertLocalPreview() {
  if (process.env.ALLOW_LOCAL_SCHEDULE_PREVIEW !== '1') {
    throw new Error('Set ALLOW_LOCAL_SCHEDULE_PREVIEW=1 to load the local schedule preview.');
  }

  const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL || '');
  if (!['localhost', '127.0.0.1'].includes(appUrl.hostname)) {
    throw new Error('This script is restricted to a localhost preview environment.');
  }
}

async function main() {
  assertLocalPreview();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.classOccurrence.findMany({
      where: { startAt: { gte: SEPTEMBER_START, lt: OCTOBER_START } },
      include: {
        _count: {
          select: {
            bookings: true,
            waitlistEntries: true,
            attendanceRecords: true,
            classMessages: true,
            commerceOrders: true,
          },
        },
      },
    });
    const protectedOccurrences = existing.filter((item) =>
      Object.values(item._count).some((count) => count > 0),
    );
    if (protectedOccurrences.length > 0) {
      throw new Error(
        `Refusing to replace ${protectedOccurrences.length} September occurrence(s) with related records.`,
      );
    }

    const categories = await tx.classCategory.findMany({
      where: { slug: { in: ['dance', 'strength'] } },
      select: { id: true, slug: true },
    });
    const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));
    const danceCategoryId = categoryBySlug.get('dance');
    const strengthCategoryId = categoryBySlug.get('strength');
    if (!danceCategoryId || !strengthCategoryId) {
      throw new Error('The Dance or Strength & HIIT category is missing.');
    }

    await tx.classTemplate.upsert({
      where: { slug: MOMMY_SLUG },
      create: {
        id: 'rhyze-mommy-and-me-2026',
        categoryId: danceCategoryId,
        name: 'Mommy & Me',
        slug: MOMMY_SLUG,
        description: 'A 45-minute specialty event for one parent and child. Full class details coming soon.',
        durationMinutes: 45,
        intensity: 'ALL_LEVELS',
        defaultCapacity: 25,
        dropInPriceCents: 3_000,
        tags: ['NEW!', 'Parent & child'],
        equipment: [],
        isActive: true,
        isEvent: true,
      },
      update: {
        name: 'Mommy & Me',
        durationMinutes: 45,
        dropInPriceCents: 3_000,
        isActive: true,
        isEvent: true,
        archivedAt: null,
      },
    });
    await tx.classTemplate.upsert({
      where: { slug: 'work-tone-mswoy36a' },
      create: {
        id: 'rhyze-work-and-tone-2026',
        categoryId: strengthCategoryId,
        name: 'Work & Tone',
        slug: 'work-tone-mswoy36a',
        description: 'Forget isolated reps. Work & Tone is a rhythm-driven, total-body conditioning class designed to challenge your strength, stability, and endurance to the beat of the music. Come ready to sweat, lock into the rhythm, and do the work.',
        durationMinutes: 50,
        intensity: 'ALL_LEVELS',
        defaultCapacity: 20,
        dropInPriceCents: 2_500,
        tags: ['NEW!', 'Rhythm-driven conditioning'],
        equipment: [],
        isActive: true,
        isEvent: false,
      },
      update: {
        name: 'Work & Tone',
        durationMinutes: 50,
        isActive: true,
        isEvent: false,
        archivedAt: null,
      },
    });
    await tx.classTemplate.update({
      where: { slug: 'pound-mackenzie' },
      data: { durationMinutes: 30 },
    });

    const requiredSlugs = [...new Set(
      SEPTEMBER_2026_SCHEDULE.map((slot) => slot.templateSlug),
    )];
    const templates = await tx.classTemplate.findMany({
      where: { slug: { in: requiredSlugs } },
      include: {
        occurrences: {
          where: { roomId: { not: null } },
          select: { roomId: true },
          orderBy: { startAt: 'desc' },
          take: 1,
        },
      },
    });
    if (templates.length !== requiredSlugs.length) {
      const found = new Set(templates.map((template) => template.slug));
      throw new Error(`Missing templates: ${requiredSlugs.filter((slug) => !found.has(slug)).join(', ')}`);
    }

    const fallbackRoom = await tx.room.findFirst({
      where: {
        isActive: true,
        name: 'Main Floor',
        location: { name: { contains: 'Lafayette', mode: 'insensitive' } },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!fallbackRoom) throw new Error('The Lafayette Main Floor room is missing.');

    const requiredEmails = [...new Set(
      SEPTEMBER_2026_SCHEDULE.flatMap((slot) =>
        slot.instructorEmail ? [slot.instructorEmail] : [],
      ),
    )];
    const instructorUsers = await tx.user.findMany({
      where: { email: { in: requiredEmails }, status: 'ACTIVE' },
      include: { instructorProfile: true },
    });
    if (instructorUsers.length !== requiredEmails.length) {
      const found = new Set(instructorUsers.map((user) => user.email));
      throw new Error(`Missing active instructors: ${requiredEmails.filter((email) => !found.has(email)).join(', ')}`);
    }

    const templatesBySlug = new Map(templates.map((template) => [template.slug, template]));
    const instructorsByEmail = new Map(instructorUsers.map((user) => [user.email, user]));
    const occurrences = SEPTEMBER_2026_SCHEDULE.map((slot) => {
      const template = templatesBySlug.get(slot.templateSlug)!;
      const instructor = slot.instructorEmail
        ? instructorsByEmail.get(slot.instructorEmail)!
        : null;
      const startAt = parseOccurrenceLocalStart(`${slot.date}T${slot.time}`);
      const endAt = new Date(startAt.getTime() + slot.durationMinutes * 60_000);
      const pay = instructor
        ? defaultInstructorPayForOccurrence({
            isEvent: template.isEvent,
            standardClassRateCents: instructor.instructorProfile?.standardClassRateCents,
            specialtyEventRateCents: instructor.instructorProfile?.specialtyEventRateCents,
          })
        : {
            method: template.isEvent ? 'SPECIALTY_EVENT_RATE' : 'STANDARD_CLASS_RATE',
            cents: null,
          };

      return {
        id: `preview-sep-${slot.date}-${slot.time.replace(':', '')}-${slot.templateSlug}`,
        templateId: template.id,
        instructorId: instructor?.id || null,
        roomId: template.occurrences[0]?.roomId || fallbackRoom.id,
        startAt,
        endAt,
        timezone: 'America/New_York',
        capacity: template.defaultCapacity,
        priceCents: template.dropInPriceCents,
        status: 'SCHEDULED' as const,
        publicNotes: slot.templateSlug === MOMMY_SLUG
          ? 'NEW! $30 per parent with one child; $5 for each additional child.'
          : null,
        internalNotes: slot.plannedInstructor
          ? `Planned instructor: ${slot.plannedInstructor}. Assign after instructor profile is created.`
          : null,
        titleOverride: slot.titleOverride || null,
        substituteInstructorName: slot.displayInstructorName || null,
        isSubstitute: slot.isSubstitute || false,
        instructorPayMethod: pay.method,
        instructorPayCents: pay.cents,
        instructorPayNote: instructor ? null : 'Set instructor and pay when the instructor profile is ready.',
      };
    });

    await tx.classOccurrence.deleteMany({
      where: { startAt: { gte: SEPTEMBER_START, lt: OCTOBER_START } },
    });
    await tx.classOccurrence.createMany({ data: occurrences });
    await tx.auditLog.upsert({
      where: { id: 'preview-september-2026-schedule' },
      create: {
        id: 'preview-september-2026-schedule',
        action: 'schedule.preview.loaded',
        entityType: 'ClassOccurrence',
        entityId: 'september-2026',
        after: { occurrenceCount: occurrences.length, environment: 'local-preview' },
      },
      update: {
        after: { occurrenceCount: occurrences.length, environment: 'local-preview' },
      },
    });

    return { removed: existing.length, created: occurrences.length };
  });

  console.log(`Local September preview loaded: ${result.created} created, ${result.removed} replaced.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
