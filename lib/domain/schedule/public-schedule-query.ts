import 'server-only';
import { prisma } from '@/lib/db/prisma';
import {
  buildPublicScheduleFilterOptions,
  localDateKey,
  PUBLIC_SCHEDULE_TIMEZONE,
  publicScheduleDetailHref,
  startOfLocalDateUtc,
  type PublicCalendarSlot,
} from './public-calendar';

function datePart(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
) {
  return date.toLocaleString('en-US', { timeZone: timezone, ...options });
}

function instructorPhoto(name: string, profilePhoto?: string | null) {
  const normalized = name.toLowerCase();
  if (normalized.includes('vanessa')) return '/founders/instructor-vanessa.jpg';
  if (normalized.includes('adrianna') || normalized.includes('adriana')) {
    return '/founders/instructor-adriana.jpg';
  }
  if (normalized.includes('mackenzie') || normalized.includes('kenzie')) {
    return '/founders/instructor-mackenzie-heffernan.jpg';
  }
  if (normalized.includes('rachel')) return '/founders/instructor-rachel.jpg';
  if (normalized.includes('tricia')) return '/founders/instructor-tricia.jpg';
  if (normalized.includes('julie')) return '/founders/instructor-julie.jpg';
  if (normalized.includes('melissa')) return '/founders/instructor-melissa.jpg';
  if (normalized.includes('jessica') || normalized.includes('nicole')) {
    return '/founders/instructor-jessica.jpg';
  }
  if (normalized.includes('carla')) return '/founders/instructor-carla.jpg';
  if (profilePhoto && !profilePhoto.startsWith('/founders/')) return profilePhoto;
  return '/founders/instructor-vanessa.jpg';
}

function classNameWithInstructor(className: string, instructorName: string) {
  if (
    !instructorName ||
    instructorName === 'Instructor to be announced' ||
    /\bwith\b/i.test(className)
  ) {
    return className;
  }
  return `${className} with ${instructorName.split(' ')[0]}`;
}

export async function loadPublicScheduleSlots(
  from = startOfLocalDateUtc(localDateKey(), PUBLIC_SCHEDULE_TIMEZONE),
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
      ...(filters.instructorId ? { instructorId: filters.instructorId } : {}),
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

  return occurrences.map((occurrence) => {
    const timezone = occurrence.timezone || PUBLIC_SCHEDULE_TIMEZONE;
    const instructorName =
      occurrence.instructor?.name || 'Instructor to be announced';

    return {
      id: occurrence.id,
      dateKey: localDateKey(occurrence.startAt, timezone),
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
      className: classNameWithInstructor(occurrence.template.name, instructorName),
      category: occurrence.template.category.name,
      instructor: instructorName,
      photo: instructorPhoto(
        instructorName,
        occurrence.instructor?.instructorProfile?.photoUrl,
      ),
      room: occurrence.room?.name || 'Rhyze Floor',
      duration: `${occurrence.template.durationMinutes} min`,
      capacity: occurrence.capacity,
      booked: occurrence._count.bookings,
      waitlist: occurrence._count.waitlistEntries,
      price: `$${((occurrence.priceCents || occurrence.template.dropInPriceCents || 0) / 100).toFixed(0)}`,
      bookingHref: publicScheduleDetailHref(occurrence.id),
    };
  });
}

export async function loadPublicEventSlots(
  from = startOfLocalDateUtc(localDateKey(), PUBLIC_SCHEDULE_TIMEZONE),
): Promise<PublicCalendarSlot[]> {
  const slots = await loadPublicScheduleSlots(from);
  return slots
    .filter((slot) => {
      const name = slot.className.toLowerCase();
      return (
        name.includes('hip-hop happy hour') ||
        name.includes('heels') ||
        name.includes('seat seduction') ||
        name.includes('workshop') ||
        name.includes('event')
      );
    })
    .slice(0, 6);
}

export async function loadPublicScheduleFilterOptions(
  from = startOfLocalDateUtc(localDateKey(), PUBLIC_SCHEDULE_TIMEZONE),
) {
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
