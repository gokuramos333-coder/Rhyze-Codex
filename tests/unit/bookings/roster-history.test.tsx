import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/app/(portal)/instructor/classes/[occurrenceId]/roster/actions', () => ({ markAttendanceAction: vi.fn(), restoreCreditAction: vi.fn() }));
import { Roster } from '@/components/attendance/Roster';
import { rosterHistoryBookingWhere, rosterConfirmedBookings } from '@/lib/domain/bookings/roster-history';

describe('cancellation history on the roster', () => {
  it('includes late cancellations and regular cancellations without broadening the capacity filter', () => {
    expect(rosterHistoryBookingWhere()).toMatchObject({ OR: expect.arrayContaining([{ status: { in: ['CANCELLED', 'LATE_CANCELLED', 'NO_SHOW', 'ATTENDED'] } }]) });
    expect(rosterConfirmedBookings([{ status: 'CONFIRMED' }, { status: 'LATE_CANCELLED' }, { status: 'CANCELLED' }])).toHaveLength(1);
  });
  it('shows exact recorded cancellation time and explicit red late-cancel label', () => {
    vi.stubGlobal('React', React);
    const html = renderToStaticMarkup(<Roster occurrenceId="class" bookings={[{
      id: 'booking', status: 'LATE_CANCELLED', bookedAt: new Date('2026-09-20T10:00:00Z'),
      cancelledAt: new Date('2026-09-21T15:22:33Z'), user: { id: 'member', name: 'Test', email: 'test@example.test' },
      attendance: null, paymentMethod: 'Membership', currentPlan: 'VIP',
    }]} />);
    expect(html).toContain('Late cancellation');
    expect(html).toContain('11:22:33 AM EDT');
    expect(html).toContain('2026-09-21T15:22:33.000Z');
    expect(html).toContain('border-red-700');
    vi.unstubAllGlobals();
  });
});
