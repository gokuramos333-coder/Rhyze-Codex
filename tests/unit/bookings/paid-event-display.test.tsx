import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SpecialEventRoster } from '@/lib/payments/special-event-roster';

const { db, paidEventDisplayCount, specialEventRoster, requireArea } = vi.hoisted(() => ({
  db: {
    classTemplate: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    classOccurrence: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    creditLedgerEntry: { findMany: vi.fn() }, user: { findMany: vi.fn() },
    classCategory: { findMany: vi.fn().mockResolvedValue([]) },
    sombleTransaction: { findMany: vi.fn().mockResolvedValue([]) },
    purchase: { findMany: vi.fn().mockResolvedValue([]) },
    booking: { findMany: vi.fn().mockResolvedValue([]) },
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

vi.mock('@/app/(studio)/admin/classes/actions', () => ({ createClassTemplateAction: vi.fn() }));

import AdminClassesPage from '@/app/(studio)/admin/classes/page';
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
function ordinaryBooking(
  id: string, name: string, source = 'STRIPE_EVENT',
  status = 'CONFIRMED', attendance: { status: string } | null = null,
) {
  return {
    id, status, attendance, source, bookedAt: new Date(), policySnapshot: {},
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

afterEach(() => vi.useRealTimers());

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


it('shows the same past-event attendance before and after a checked-in guest links their account', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-28T16:00:00Z'));
  const eventRoster = structuredClone(roster);
  const [buyer, guest] = eventRoster.groups[0].attendees;
  buyer.attendanceStatus = 'NO_SHOW';
  specialEventRoster.mockResolvedValue(eventRoster);
  occurrence.bookings = [
    ordinaryBooking('buyer-booking', 'Sample Buyer', 'STRIPE_EVENT', 'NO_SHOW', { status: 'NO_SHOW' }),
    ordinaryBooking('comp', 'Comp Guest', 'OWNER_COMPLIMENTARY'),
  ];
  async function calendar() {
    return renderToStaticMarkup(await AdminClassesPage({
      searchParams: Promise.resolve({ range: 'day', date: '2026-12-27' }),
    }));
  }
  const beforeCheckIn = await calendar();
  expect(beforeCheckIn).toContain('4/25 signups');
  expect(beforeCheckIn).toContain('0 attended');
  expect(beforeCheckIn).toContain('3 attendance unmarked');

  // An identifiable unpaid legacy booking must never change either counter.
  occurrence.bookings.push(ordinaryBooking('ineligible-booking', 'Expired Unpaid Buyer'));
  expect(await calendar()).toContain('3 attendance unmarked');

  guest.attendanceStatus = 'CHECKED_IN';
  guest.checkedInAt = new Date('2026-12-27T16:00:00Z');
  const checkedIn = await calendar();
  expect(checkedIn).toContain('1 attended');
  expect(checkedIn).toContain('2 attendance unmarked');

  guest.userId = 'guest';
  guest.bookingId = 'linked-guest';
  eventRoster.linkedBookingIds.push('linked-guest');
  occurrence.bookings.push(ordinaryBooking('linked-guest', 'Sample Guest', 'STRIPE_EVENT', 'ATTENDED', {
    status: 'CHECKED_IN',
  }));
  const linked = await calendar();
  expect(linked).toContain('4/25 signups');
  expect(linked).toContain('1 attended');
  expect(linked).toContain('2 attendance unmarked');

  guest.attendanceStatus = null;
  occurrence.bookings[occurrence.bookings.length - 1] = ordinaryBooking(
    'linked-guest', 'Sample Guest', 'STRIPE_EVENT', 'LATE_CANCELLED',
  );
  const lateCanceled = await calendar();
  expect(lateCanceled).toContain('0 attended');
  expect(lateCanceled).toContain('2 attendance unmarked');
});
