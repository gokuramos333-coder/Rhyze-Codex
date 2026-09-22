import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  classTemplate: { findFirst: vi.fn(), findMany: vi.fn() },
  classOccurrence: { findFirst: vi.fn(), findMany: vi.fn() },
  product: { findMany: vi.fn() }, user: { findMany: vi.fn() },
  classCategory: { findMany: vi.fn() }, sombleTransaction: { findMany: vi.fn() },
  purchase: { findMany: vi.fn() }, booking: { findMany: vi.fn() }, commerceOrder: { findMany: vi.fn() },
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: db }));
vi.mock('server-only', () => ({}));
vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock('@/app/(studio)/admin/classes/actions', () => ({ archiveClassTemplateAction: vi.fn(), createClassTemplateAction: vi.fn(), deleteClassTemplateAction: vi.fn() }));
import { loadPublicScheduleSlots } from '@/lib/domain/schedule/public-schedule-query';
import EventDetailPage from '@/app/events/[slug]/page';
import EventBookingPage from '@/app/book/event/[slug]/page';
import BookingPage from '@/app/book/[slug]/page';
import AdminClassesPage from '@/app/(studio)/admin/classes/page';
import AdminEventsPage from '@/app/(studio)/admin/events/page';
import { EventsPreview } from '@/components/sections/EventsPreview';

function propsFromTree(node: React.ReactNode): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(propsFromTree);
  if (!React.isValidElement(node)) return [];
  const props = node.props as { children?: React.ReactNode };
  return [props, ...propsFromTree(props.children)];
}

describe('artwork across schedule, public and portal surfaces', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
    vi.clearAllMocks();
    for (const model of [db.product, db.user, db.classCategory, db.sombleTransaction, db.purchase, db.booking, db.commerceOrder]) model.findMany.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('retains template artwork when a standard class has no upcoming occurrence', async () => {
    db.classOccurrence.findFirst.mockResolvedValue(null);
    db.classTemplate.findFirst.mockResolvedValue({ imageUrl: '/template-only.jpg' });
    const page = await BookingPage({ params: Promise.resolve({ slug: 'work-tone-mswoy36a' }), searchParams: Promise.resolve({}) });
    expect(propsFromTree(page).some((props) => props.src === '/template-only.jpg')).toBe(true);
  });

  it('carries selected event occurrence into queries and does not silently book another date if unavailable', async () => {
    db.classTemplate.findFirst.mockResolvedValue({ id: 'event', slug: 'event', name: 'Event', description: 'Event.', occurrences: [] });
    db.classOccurrence.findFirst.mockResolvedValue(null);
    const params = Promise.resolve({ slug: 'event' });
    const searchParams = Promise.resolve({ occurrence: 'second-date' });
    await expect(EventDetailPage({ params, searchParams })).rejects.toThrow('404');
    expect(db.classTemplate.findFirst.mock.calls[0][0].include.occurrences.where.id).toBe('second-date');
    await expect(EventBookingPage({ params, searchParams })).rejects.toThrow('404');
    expect(db.classOccurrence.findFirst.mock.calls[0][0].where.id).toBe('second-date');
  });

  it.each([
    ['/date.jpg', '/template.jpg', '/date.jpg'],
    [null, '/template.jpg', '/template.jpg'],
    [null, null, '/teacher.jpg'],
  ])('renders date %s / template %s as %s everywhere', async (imageUrl, templateImage, expected) => {
    const template = {
      id: 'template', name: 'Work & Tone with Avery', slug: 'work-tone-mswoy36a', description: 'Studio movement.',
      imageUrl: templateImage, durationMinutes: 50, defaultCapacity: 25, dropInPriceCents: 2500, isEvent: false,
      category: { name: 'Strength', slug: 'strength' }, _count: { occurrences: 1 },
    };
    const occurrence = {
      id: 'date', imageUrl, template, capacity: 25, historicalSignupCount: 0, status: 'SCHEDULED',
      timezone: 'America/New_York', startAt: new Date('2026-09-26T16:00:00Z'), endAt: new Date('2026-09-26T16:50:00Z'),
      instructor: { name: 'Avery', instructorProfile: { isActive: true, photoUrl: '/teacher.jpg' } },
      bookings: [], commerceOrders: [], _count: { bookings: 0, waitlistEntries: 0 },
    };
    db.classTemplate.findFirst.mockResolvedValue({ ...template, occurrences: [occurrence] });
    db.classTemplate.findMany.mockResolvedValue([{ ...template, occurrences: [occurrence] }]);
    db.classOccurrence.findFirst.mockResolvedValue(occurrence);
    db.classOccurrence.findMany.mockResolvedValue([occurrence]);
    expect((await loadPublicScheduleSlots())[0].photo).toBe(expected);
    const params = Promise.resolve({ slug: template.slug });
    const pages = [
      await EventDetailPage({ params }),
      await EventBookingPage({ params }),
      await BookingPage({ params, searchParams: Promise.resolve({}) }),
      await EventsPreview({}),
      await AdminClassesPage({ searchParams: Promise.resolve({}) }),
      await AdminEventsPage({ searchParams: Promise.resolve({}) }),
    ];
    for (const page of pages) expect(propsFromTree(page).some((props) => props.src === expected)).toBe(true);
    const adminProps = propsFromTree(pages[4]).find((props) => Array.isArray(props.occurrences));
    expect((adminProps?.occurrences as { photo: string }[])[0].photo).toBe(expected);
  });
});
