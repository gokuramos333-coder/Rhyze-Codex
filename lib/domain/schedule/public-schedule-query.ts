import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { resolvePublicInstructorPhoto } from './public-instructor-photo';
import {
  buildPublicScheduleFilterOptions,
  localDateKey,
  publicScheduleDetailHref,
  type PublicCalendarSlot,
} from './public-calendar';
import {
  occurrenceInstructorName,
  occurrenceTitle,
  occurrenceTitleWithInstructor,
} from './occurrence-management';

function datePart(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
) {
  return date.toLocaleString('en-US', { timeZone: timezone, ...options });
}

function isAugust2026WednesdayReplacementWindow(date: Date, timezone: string) {
  const localDate = localDateKey(date, timezone);
  return localDate >= '2026-08-17' && localDate <= '2026-08-31';
}

function isThisWeekIgniteSub(date: Date, timezone: string, templateName: string) {
  const localDate = localDateKey(date, timezone);
  return (
    localDate >= '2026-08-17' &&
    localDate <= '2026-08-23' &&
    templateName.toLowerCase().startsWith('ignite')
  );
}

export async function loadPublicScheduleSlots(
  from = new Date(),
  filters: {
    classSlug?: string;
    categorySlug?: string;
    instructorId?: string;
  } = {},
): Promise<PublicCalendarSlot[]> {
  const occurrences = await prisma.classOccurrence.findMany({
    where: {
      status: 'SCHEDULED',
      startAt: { gte: from },
      template: {
        isActive: true,
        archivedAt: null,
        ...(filters.classSlug ? { slug: filters.classSlug } : {}),
        ...(filters.categorySlug
          ? { category: { slug: filters.categorySlug } }
          : {}),
      },
      ...(filters.instructorId
        ? { instructorId: filters.instructorId }
        : {}),
    },
    include: {
      template: { include: { category: true } },
      instructor: { include: { instructorProfile: true } },
      room: true,
      _count: {
        select: {
          bookings: { where: { status: 'CONFIRMED' } },
          waitlistEntries: { where: { status: 'WAITING' } },
        },
      },
    },
    orderBy: { startAt: 'asc' },
    take: 180,
  });

  return occurrences.flatMap((occurrence) => {
    const timezone = occurrence.timezone || 'America/New_York';
    const templateName = occurrence.template.name;
    const isWednesdayReplacement = isAugust2026WednesdayReplacementWindow(occurrence.startAt, timezone);
    const lowerTemplateName = templateName.toLowerCase();
    if (
      isWednesdayReplacement &&
      (lowerTemplateName.includes('core 360') || lowerTemplateName.includes('core with carla'))
    ) {
      return [];
    }
    const isWorkAndToneReplacement =
      isWednesdayReplacement && lowerTemplateName.includes('grind & grow');
    const isIgniteSub = isThisWeekIgniteSub(occurrence.startAt, timezone, templateName);
    const instructorName = isWorkAndToneReplacement || isIgniteSub ? 'Vanessa Ramos' : occurrenceInstructorName(occurrence);
    const assignedInstructorName = occurrenceInstructorName(occurrence);
    const dateKey = localDateKey(occurrence.startAt, timezone);

    const baseClassName = isWorkAndToneReplacement
      ? 'Work & Tone'
      : isIgniteSub
        ? 'Ignite with Vanessa'
        : occurrenceTitle(occurrence);

    return {
      id: occurrence.id,
      dateKey,
      dayLabel: datePart(occurrence.startAt, timezone, { weekday: 'long' }),
      shortDay: datePart(occurrence.startAt, timezone, { weekday: 'short' }),
      dateLabel: datePart(occurrence.startAt, timezone, {
        month: 'short',
        day: 'numeric',
      }),
      timeLabel: datePart(occurrence.startAt, timezone, {
        hour: 'numeric',
        minute: '2-digit',
      }),
      templateSlug: occurrence.template.slug,
      className: occurrenceTitleWithInstructor(baseClassName, instructorName),
      category: occurrence.template.category.name,
      instructor: instructorName,
      photo: resolvePublicInstructorPhoto({
        assignedInstructorName,
        displayInstructorName: instructorName,
        assignedProfile: occurrence.instructor?.instructorProfile,
      }),
      isEvent: occurrence.template.isEvent,
      isSubstitute: occurrence.isSubstitute || isIgniteSub,
      room: occurrence.room?.name || 'Rhyze Floor',
      duration: `${occurrence.template.durationMinutes} min`,
      capacity: occurrence.capacity,
      booked:
        occurrence._count.bookings + occurrence.historicalSignupCount,
      waitlist: occurrence._count.waitlistEntries,
      price: `$${((occurrence.priceCents || 2500) / 100).toFixed(0)}`,
      bookingHref: publicScheduleDetailHref({
        occurrenceId: occurrence.id,
        templateSlug: occurrence.template.slug,
        isEvent: occurrence.template.isEvent,
      }),
    };
  });
}

export async function loadPublicScheduleFilterOptions(from = new Date()) {
  const occurrences = await prisma.classOccurrence.findMany({
    where: {
      status: 'SCHEDULED',
      startAt: { gte: from },
      template: { isActive: true, archivedAt: null },
    },
    select: {
      instructor: { select: { id: true, name: true } },
      template: {
        select: {
          category: { select: { name: true, slug: true } },
        },
      },
    },
    orderBy: { startAt: 'asc' },
  });

  return buildPublicScheduleFilterOptions(
    occurrences.map((occurrence) => ({
      instructor: occurrence.instructor,
      category: occurrence.template.category,
    })),
  );
}
