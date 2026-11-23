import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SpecialEventRoster } from '@/lib/payments/special-event-roster';

const { db, paidEventDisplayCount, specialEventRoster, requireArea } = vi.hoisted(() => ({
  db: {
    classTemplate: { findFirst: vi.fn() },
    classOccurrence: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    creditLedgerEntry: { findMany: vi.fn() }, user: { findMany: vi.fn() },
  },
  paidEventDisplayCount: vi.fn(),
  specialEventRoster: vi.fn(),
  requireArea: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: db }));
vi.mock('@/lib/auth/session', () => ({ requireArea }));
vi.mock('@/lib/payments/special-event-roster', () => ({ paidEventDisplayCount, specialEventRoster }));
vi.mock('@/app/(studio)/admin/schedule/[occurrenceId]/roster/actions', () => ({
  addMemberToClassAction: vi.fn(), addOwnerComplimentaryBookingAction: vi.fn(),
}));
vi.mock('@/app/(studio)/admin/schedule/[occurrenceId]/roster/black-friday-actions', () => ({ blackFridayStaffAction: vi.fn() }));
vi.mock('@/app/(portal)/instructor/classes/[occurrenceId]/roster/actions', () => ({
  markAttendanceAction: vi.fn(), restoreCreditAction: vi.fn(),
}));
vi.mock('@/app/(portal)/instructor/classes/[occurrenceId]/roster/guest-actions', () => ({
  checkInAction: vi.fn(), searchAccountsAction: vi.fn(), linkAccountAction: vi.fn(), recordPaperWaiverAction: vi.fn(),
}));
vi.mock('@/components/live/LiveDataRefresh', () => ({ LiveDataRefresh: () => null }));
vi.mock('server-only', () => ({}));

import AdminRosterPage from '@/app/(studio)/admin/schedule/[occurrenceId]/roster/page';
import InstructorRosterPage from '@/app/(portal)/instructor/classes/[occurrenceId]/roster/page';
import EventDetailPage from '@/app/events/[slug]/page';
import EventBookingPage from '@/app/book/event/[slug]/page';
import { loadPublicScheduleSlots } from '@/lib/domain/schedule/public-schedule-query';

const occurrenceId = 'schedule-import-12cc3b9897966042d0954cb495b0';
const slug = 'get-fit-with-the-fishers-mw000b75';
const roster: SpecialEventRoster = {
  groups: [{
    orderId: 'order', cashPaidCents: 4000,
    attendees: [{
      role: 'BUYER', fullName: 'Sample Buyer', phone: null, userId: 'buyer', bookingId: 'buyer-booking',
      contribution: 'CASH_TICKET', waiver: 'ELECTRONIC', attendanceStatus: null, checkedInAt: null, markedById: null,
    }, {
      role: 'GUEST', fullName: 'Sample Guest', phone: '+12015550190', userId: null, bookingId: null,
      contribution: 'CASH_TICKET', waiver: 'NEEDED', attendanceStatus: null, checkedInAt: null, markedById: null,
    }],
  }],
  linkedBookingIds: ['buyer-booking', 'ineligible-booking'],
  reviewItems: [{
    orderId: 'private', management: 'LEGACY_ORDER', buyerName: 'Private Payment Issue', state: 'FULFILLMENT_REVIEW',
    collectedCents: 3000, remainingCents: 3000, canRefund: false, canReconcile: false,
  }],
  canLinkAccounts: true,
  currentWaiverVersionId: 'waiver',
};
function ordinaryBooking(id: string, name: string, source = 'STRIPE_EVENT') {
  return {
    id, status: 'CONFIRMED', source, bookedAt: new Date(), policySnapshot: {},
    user: { id: name, name, email: 'staff-preview@example.invalid', memberships: [] },
  };
}
function fixture() {
  const template = {
    id: 'cmw000b760001la097ii57bjb', name: 'Synthetic fitness event', slug,
    description: 'Fictional preview event.', durationMinutes: 60, isEvent: true, category: { name: 'Events' },
  };
  return {
    id: occurrenceId, template, instructorId: 'instructor', instructor: null, room: null,
    startAt: new Date('2026-12-27T16:00:00Z'), endAt: new Date('2026-12-27T17:00:00Z'),
    timezone: 'America/New_York', capacity: 25, historicalSignupCount: 1, pendingTicketSeats: 2,
    priceCents: 2500, _count: { bookings: 3, waitlistEntries: 0 },
    bookings: [
      ordinaryBooking('buyer-booking', 'Sample Buyer'),
      ordinaryBooking('ineligible-booking', 'Expired Unpaid Buyer'),
      ordinaryBooking('comp', 'Comp Guest', 'OWNER_COMPLIMENTARY'),
    ],
    waitlistEntries: [],
  };
}
let occurrence: ReturnType<typeof fixture>;
beforeEach(() => {
  occurrence = fixture();
  db.classOccurrence.findUnique.mockResolvedValue(occurrence);
  db.classOccurrence.findFirst.mockResolvedValue(occurrence);
  db.classOccurrence.findMany.mockResolvedValue([occurrence]);
  db.classTemplate.findFirst.mockResolvedValue({ ...occurrence.template, occurrences: [occurrence] });
  db.creditLedgerEntry.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
  paidEventDisplayCount.mockResolvedValue(4);
  specialEventRoster.mockResolvedValue(roster);
  requireArea.mockImplementation(async (area: string) =>
    area === 'admin' ? { id: 'staff', role: 'OWNER' } : { id: 'instructor', role: 'INSTRUCTOR' });
});

it('counts paid seats once and keeps complimentary admissions in the admin roster', async () => {
  const html = renderToStaticMarkup(await AdminRosterPage({ params: Promise.resolve({ occurrenceId }) }));
  expect(html).toContain('4/25 booked');
  expect(html.match(/Sample Buyer/g)).toHaveLength(1);
  expect(html.match(/Sample Guest/g)).toHaveLength(1);
  expect(html).toContain('Complimentary');
  expect(html).toContain('Comp Guest');
  expect(html).not.toContain('Paid with: Complimentary');
  expect(html).not.toContain('Expired Unpaid Buyer');
  expect(html.indexOf('Private Payment Issue')).toBeGreaterThan(html.indexOf('Comp Guest'));
  expect(specialEventRoster).toHaveBeenCalledWith(occurrenceId, { id: 'staff' });
});

it('shows the assigned instructor the same attendees without private payment history', async () => {
  const html = renderToStaticMarkup(await InstructorRosterPage({ params: Promise.resolve({ occurrenceId }) }));
  expect(html).toContain('4/25 booked');
  expect(html.match(/Sample Buyer/g)).toHaveLength(1);
  expect(html.match(/Sample Guest/g)).toHaveLength(1);
  expect(html).toContain('+12015550190');
  expect(html).not.toContain('Expired Unpaid Buyer');
  expect(html).not.toContain('Private Payment Issue');
  expect(html).not.toContain('Payments and checkout history');
  expect(specialEventRoster).toHaveBeenCalledWith(occurrenceId, { id: 'instructor' });
  expect(db.classOccurrence.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: occurrenceId, instructorId: 'instructor' },
  }));
});

it('uses the same public paid count on the event detail and booking pages while holds fill capacity', async () => {
  occurrence._count.bookings = 8;
  occurrence.capacity = 11;
  paidEventDisplayCount.mockResolvedValue(10);
  for (const page of [EventDetailPage, EventBookingPage]) {
    const html = renderToStaticMarkup(await page({ params: Promise.resolve({ slug }) }));
    expect(html).toContain('10/11');
    expect(html).not.toContain('11/11');
    expect(html).toContain('Join Waiting List');
    expect(html).not.toContain('+12015550190');
  }
  expect(specialEventRoster).not.toHaveBeenCalled();
});

it('keeps low paid counts private when a held last seat routes to the waitlist', async () => {
  occurrence.capacity = 6;
  const html = renderToStaticMarkup(await EventDetailPage({ params: Promise.resolve({ slug }) }));
  expect(html).not.toContain('4/6');
  expect(html).toContain('Join Waiting List');
});

it('provides paid booked counts and hold-aware availability on the public calendar', async () => {
  occurrence.capacity = 6;
  const [slot] = await loadPublicScheduleSlots();
  expect(slot.booked).toBe(4);
  expect(slot.availability?.soldOut).toBe(true);
  expect(slot).not.toHaveProperty('pendingTicketSeats');
});
