import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  classTemplate: { findFirst: vi.fn() },
  classOccurrence: { findFirst: vi.fn(), findUnique: vi.fn() },
  booking: { findMany: vi.fn(), updateMany: vi.fn() },
  attendanceRecord: { deleteMany: vi.fn() },
  creditLedgerEntry: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: db }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); } }));
vi.mock('@/components/attendance/Roster', () => ({ Roster: () => null }));
vi.mock('@/app/(studio)/admin/schedule/[occurrenceId]/roster/actions', () => ({
  addMemberToClassAction: vi.fn(), addOwnerComplimentaryBookingAction: vi.fn(),
}));
import EventDetailPage from '@/app/events/[slug]/page';
import EventBookingPage from '@/app/book/event/[slug]/page';
import AdminRosterPage from '@/app/(studio)/admin/schedule/[occurrenceId]/roster/page';

describe('GET page renders never reconcile or delete booking history', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
    vi.clearAllMocks();
    // Previously this read result made merely visiting any event/roster cancel a booking.
    db.booking.findMany.mockResolvedValue([{ id: 'legacy-confirmed-booking' }]);
    db.booking.updateMany.mockResolvedValue({ count: 1 });
    db.attendanceRecord.deleteMany.mockResolvedValue({ count: 1 });
    db.classTemplate.findFirst.mockResolvedValue({
      id: 'event-template', slug: 'test-event', name: 'Test event', description: 'A studio event.',
      durationMinutes: 45, dropInPriceCents: 3000, defaultCapacity: 25, occurrences: [],
    });
    db.classOccurrence.findFirst.mockResolvedValue(null);
    db.classOccurrence.findUnique.mockResolvedValue({
      id: 'occurrence', template: { name: 'Test class' }, instructor: null,
      startAt: new Date('2026-09-26T16:00:00Z'), historicalSignupCount: 0,
      capacity: 25, bookings: [], waitlistEntries: [],
    });
    db.creditLedgerEntry.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['event details', () => EventDetailPage({ params: Promise.resolve({ slug: 'test-event' }) })],
    ['event booking', () => EventBookingPage({ params: Promise.resolve({ slug: 'test-event' }) })],
    ['admin roster', () => AdminRosterPage({ params: Promise.resolve({ occurrenceId: 'occurrence' }) })],
  ] as const)('%s does not mutate a previously confirmed booking', async (_name, visit) => {
    expect(await visit()).toBeTruthy();
    expect(db.booking.updateMany).not.toHaveBeenCalled();
    expect(db.attendanceRecord.deleteMany).not.toHaveBeenCalled();
  });
});
