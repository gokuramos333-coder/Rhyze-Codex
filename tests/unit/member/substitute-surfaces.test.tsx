// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ booking: vi.fn(), waitlist: vi.fn(), destinations: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  booking: { findMany: async () => [], findFirst: mocks.booking },
  waitlistEntry: { findMany: mocks.waitlist }, membership: { findMany: async () => [] },
  creditLedgerEntry: { findFirst: async () => null }, classOccurrence: { findMany: mocks.destinations },
} }));
vi.mock('@/lib/auth/session', () => ({ requireArea: async () => ({ id: 'synthetic-member' }) }));
vi.mock('@/app/(portal)/member/bookings/actions', () => ({ cancelBookingAction: async () => {}, leaveWaitlistAction: async () => {} }));
vi.mock('@/app/(portal)/member/bookings/reschedule/actions', () => ({ rescheduleMemberBookingAction: async () => {} }));
import { RescheduleClassPicker } from '@/components/member/RescheduleClassPicker';
import MemberBookingsPage from '@/app/(portal)/member/bookings/page';
import MemberReschedulePage from '@/app/(portal)/member/bookings/reschedule/page';
const occurrence = { id: 'synthetic-substitute', startAt: new Date('2099-11-02T23:10Z'), timezone: 'America/New_York',
  titleOverride: 'Zumba', substituteInstructorName: 'Vincent', isSubstitute: true,
  capacity: 25, historicalSignupCount: 0, _count: { bookings: 0 },
  template: { name: 'Rhyze Ritmo', isEvent: false }, instructorId: 'canonical-melissa', instructor: { name: 'Melissa' } };
beforeEach(() => { mocks.waitlist.mockResolvedValue([{ id: 'waiting', occurrence }]); mocks.destinations.mockResolvedValue([]);
  mocks.booking.mockResolvedValue({ id: 'booking', occurrenceId: occurrence.id, occurrence, source: 'MEMBER', policySnapshot: {}, user: { memberships: [] } }); });
afterEach(cleanup);
it('renders substitute destination labels while retaining canonical ownership', () => {
  render(<RescheduleClassPicker destinations={[occurrence]} />);
  expect(screen.getByText('Zumba')).toBeTruthy(); expect(screen.getByText('Instructor: Vincent')).toBeTruthy();
  expect(screen.queryByText(/Melissa|Rhyze Ritmo/)).toBeNull(); expect(occurrence.instructorId).toBe('canonical-melissa');
});
it('renders the override in the member waitlist', async () => {
  render(await MemberBookingsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText('Zumba')).toBeTruthy(); expect(screen.queryByText('Rhyze Ritmo')).toBeNull();
});
it('renders the override in the reschedule source heading', async () => {
  render(await MemberReschedulePage({ searchParams: Promise.resolve({ booking: 'booking' }) }));
  expect(screen.getByText(/Moving from Zumba/)).toBeTruthy(); expect(screen.queryByText(/Rhyze Ritmo/)).toBeNull();
});
