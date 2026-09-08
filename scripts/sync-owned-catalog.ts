import { PrismaClient } from '@prisma/client';
import { classes } from '../lib/classes';
import { somblePublishedClassSchedule } from '../lib/import/somble-schedule';
import { ownedEvents } from '../lib/rhyze-platform';
import { instructors } from '../lib/instructors';
import { generateReferralCode } from '../lib/domain/onboarding/referral-code';

const prisma = new PrismaClient();
const categoryNames = {
  dance: 'Dance',
  yoga: 'Yoga & Pilates',
  strength: 'Strength & HIIT',
} as const;
const defaultStudioCapacity = 24;
const retiredTemplateSlugs = [
  'pilates-pulse',
  'rhyze-up',
] as const;
const removedTemplateSlugs = [
  'dance-fit-jessica',
  'hypnotic-heels-jessica-weekly-class',
  'hypnotic-heels-nicole-weekly-class',
] as const;

function localDate(isoDate: string, time: string) {
  const [clock, meridiem] = time.split(' ');
  const [hourText, minuteText] = clock.split(':');
  let hour = Number(hourText);
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return new Date(
    `${isoDate}T${String(hour).padStart(2, '0')}:${minuteText}:00-04:00`,
  );
}

async function main() {
  const canonicalInstructors = new Map<string, string>();
  await prisma.classOccurrence.deleteMany({
    where: {
      id: {
        in: [
          'seed-occ-rhyze-up-2026-08-05',
          'seed-occ-pilates-2026-08-03',
          ...Array.from(
            { length: 5 },
            (_, week) => `owned-wed-rhyze-up-${week}`,
          ),
        ],
      },
      bookings: { none: {} },
    },
  });

  for (const [displayOrder, instructor] of instructors.entries()) {
    const fullName = `${instructor.firstName} ${instructor.lastName}`.trim();
    let user = instructor.email
      ? await prisma.user.findUnique({ where: { email: instructor.email } })
      : null;
    user ||= await prisma.user.findFirst({
      where: { name: { equals: fullName, mode: 'insensitive' } },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: fullName,
          email: instructor.email || `${instructor.slug}@rhyze.local`,
          role: 'INSTRUCTOR',
          status: 'ACTIVE',
        },
      });
    }
    await prisma.instructorProfile.upsert({
      where: { userId: user.id },
      update: { bio: instructor.bio, photoUrl: instructor.photo, isActive: true, displayOrder },
      create: {
        userId: user.id,
        bio: instructor.bio,
        photoUrl: instructor.photo,
        isActive: true,
        canEditOwnProfile: true,
        displayOrder,
      },
    });
    if (user.name !== fullName) {
      user = await prisma.user.update({ where: { id: user.id }, data: { name: fullName } });
    }
    const referral = await prisma.referralCode.findFirst({
      where: { instructorId: user.id, isActive: true },
    });
    if (!referral) {
      const existingCodes = await prisma.referralCode.findMany({ select: { code: true } });
      await prisma.referralCode.create({
        data: {
          instructorId: user.id,
          code: generateReferralCode(fullName, existingCodes.map((item) => item.code)),
        },
      });
    }
    canonicalInstructors.set(instructor.firstName.toLowerCase(), user.id);
  }

  const categories = new Map<string, string>();
  for (const [slug, name] of Object.entries(categoryNames)) {
    const category = await prisma.classCategory.upsert({
      where: { slug },
      update: { name, isActive: true },
      create: { slug, name, isActive: true },
    });
    categories.set(slug, category.id);
  }

  for (const item of classes) {
    await prisma.classTemplate.upsert({
      where: { slug: item.slug },
      update: {
        categoryId: categories.get(item.category)!,
        name: item.name,
        description: item.description,
        durationMinutes: item.duration,
        isActive: true,
        archivedAt: null,
      },
      create: {
        categoryId: categories.get(item.category)!,
        slug: item.slug,
        name: item.name,
        description: item.description,
        durationMinutes: item.duration,
        defaultCapacity: defaultStudioCapacity,
        dropInPriceCents: 2500,
        tags: [],
        equipment: item.whatToBring,
      },
    });
  }

  const location = await prisma.location.upsert({
    where: { id: 'rhyze-lafayette' },
    update: { name: 'Rhyze Fitness Lafayette', isActive: true },
    create: { id: 'rhyze-lafayette', name: 'Rhyze Fitness Lafayette', address: 'Lafayette, NJ' },
  });

  for (const slot of somblePublishedClassSchedule) {
    const room = await prisma.room.upsert({
      where: { locationId_name: { locationId: location.id, name: slot.room } },
      update: { capacity: defaultStudioCapacity, isActive: true },
      create: { locationId: location.id, name: slot.room, capacity: defaultStudioCapacity },
    });
    const instructorId = canonicalInstructors.get(slot.instructor.split(' ')[0].toLowerCase()) || null;
    const classInfo = classes.find((item) => item.slug === slot.classSlug);
    const category = classInfo?.category || (slot.className.toLowerCase().includes('yoga') || slot.className.toLowerCase().includes('pilates') ? 'yoga' : 'dance');
    const template = await prisma.classTemplate.upsert({
      where: { slug: slot.classSlug },
      update: {
        name: slot.className,
        durationMinutes: Number.parseInt(slot.duration),
        defaultCapacity: defaultStudioCapacity,
        dropInPriceCents: Number(slot.price.replace(/\D/g, '')) * 100,
        isActive: true,
        archivedAt: null,
      },
      create: {
        categoryId: categories.get(category)!,
        slug: slot.classSlug,
        name: slot.className,
        description: classInfo?.description || `${slot.className} at Rhyze Fitness.`,
        durationMinutes: Number.parseInt(slot.duration),
        defaultCapacity: defaultStudioCapacity,
        dropInPriceCents: Number(slot.price.replace(/\D/g, '')) * 100,
        tags: [],
        equipment: classInfo?.whatToBring || [],
      },
    });

    const importedBookingCount = await prisma.booking.count({
      where: {
        occurrenceId: slot.occurrenceId,
        source: 'SOMBLE_IMPORT',
        status: { not: 'CANCELLED' },
      },
    });
    const startAt = localDate(slot.isoDate, slot.time);
    const endAt = new Date(
      startAt.getTime() + Number.parseInt(slot.duration) * 60_000,
    );
    const historicalSignupCount =
      importedBookingCount > 0 ? 0 : slot.historicalSignupCount || slot.booked;
    await prisma.classOccurrence.upsert({
      where: { id: slot.occurrenceId },
      update: {
        templateId: template.id,
        instructorId,
        roomId: room.id,
        startAt,
        endAt,
        capacity: defaultStudioCapacity,
        priceCents: Number(slot.price.replace(/\D/g, '')) * 100,
        status: 'SCHEDULED',
        historicalSignupCount,
      },
      create: {
        id: slot.occurrenceId,
        templateId: template.id,
        instructorId,
        roomId: room.id,
        startAt,
        endAt,
        capacity: defaultStudioCapacity,
        priceCents: Number(slot.price.replace(/\D/g, '')) * 100,
        historicalSignupCount,
      },
    });
  }

  const mainFloor = await prisma.room.findFirst({ where: { locationId: location.id, name: 'Main Floor' } });
  for (const event of ownedEvents) {
    const instructorId = canonicalInstructors.get(event.instructor.split(' ')[0].toLowerCase()) || null;
    const template = await prisma.classTemplate.upsert({
      where: { slug: event.slug },
      update: {
        name: event.name,
        description: event.description,
        durationMinutes: Number.parseInt(event.duration),
        defaultCapacity: defaultStudioCapacity,
        dropInPriceCents: Number(event.price.replace(/\D/g, '')) * 100,
        isEvent: true,
        isActive: true,
      },
      create: {
        categoryId: categories.get('dance')!,
        slug: event.slug,
        name: event.name,
        description: event.description,
        durationMinutes: Number.parseInt(event.duration),
        defaultCapacity: defaultStudioCapacity,
        dropInPriceCents: Number(event.price.replace(/\D/g, '')) * 100,
        isEvent: true,
        tags: ['special-event'],
        equipment: [],
      },
    });
    const match = event.fullDate.match(/(August) (\d+).*?(2026)/);
    if (!match) continue;
    const occurrenceId = `owned-event-${event.slug}`;
    const importedBookingCount = await prisma.booking.count({
      where: {
        occurrenceId,
        source: 'SOMBLE_IMPORT',
        status: { not: 'CANCELLED' },
      },
    });
    const startAt = localDate(
      `2026-08-${String(Number(match[2])).padStart(2, '0')}`,
      event.time,
    );
    const endAt = new Date(startAt.getTime() + Number.parseInt(event.duration) * 60_000);
    const historicalSignupCount =
      importedBookingCount > 0 ? 0 : event.booked;
    await prisma.classOccurrence.upsert({
      where: { id: occurrenceId },
      update: { templateId: template.id, instructorId, roomId: mainFloor?.id, startAt, endAt, capacity: defaultStudioCapacity, priceCents: Number(event.price.replace(/\D/g, '')) * 100, historicalSignupCount },
      create: { id: occurrenceId, templateId: template.id, instructorId, roomId: mainFloor?.id, startAt, endAt, capacity: defaultStudioCapacity, priceCents: Number(event.price.replace(/\D/g, '')) * 100, historicalSignupCount },
    });
  }

  const managedOccurrenceIds = new Set([
    ...somblePublishedClassSchedule.map((slot) => slot.occurrenceId),
    ...ownedEvents.map((event) => `owned-event-${event.slug}`),
  ]);
  const staleManagedOccurrences = (
    await prisma.classOccurrence.findMany({
      where: { id: { startsWith: 'owned-' } },
      select: {
        id: true,
        _count: { select: { bookings: true } },
      },
    })
  ).filter((occurrence) => !managedOccurrenceIds.has(occurrence.id));

  for (const occurrence of staleManagedOccurrences) {
    if (occurrence._count.bookings > 0) {
      throw new Error(
        `Cannot remove stale Somble occurrence ${occurrence.id}; it has booking history.`,
      );
    }
  }
  await prisma.classOccurrence.deleteMany({
    where: {
      id: { in: staleManagedOccurrences.map((occurrence) => occurrence.id) },
    },
  });

  await prisma.classTemplate.updateMany({
    where: {
      slug: { in: [...retiredTemplateSlugs] },
      occurrences: { none: {} },
    },
    data: {
      isActive: false,
      archivedAt: new Date(),
    },
  });
  await prisma.classTemplate.deleteMany({
    where: {
      slug: { in: [...removedTemplateSlugs] },
      occurrences: { none: {} },
    },
  });
}

main()
  .finally(() => prisma.$disconnect());
