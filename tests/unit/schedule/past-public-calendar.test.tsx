// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar';
import type { PublicCalendarSlot } from '@/lib/domain/schedule/public-calendar';
vi.mock('next/image', () => ({ default: () => null }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
const slot: PublicCalendarSlot = {
  id: 'past', startsAt: '2026-11-01T14:00:00Z', dateKey: '2026-11-01', dayLabel: 'Sunday', shortDay: 'Sun', dateLabel: 'Nov 1', timeLabel: '9:00 AM', className: 'Sunday Yoga', category: 'Yoga', instructor: 'Instructor', photo: '/logo.png', isEvent: false, isSubstitute: false, room: 'Main', duration: '50 min', capacity: 20, booked: 2, waitlist: 0, price: '$25', bookingHref: '/book/yoga?occurrence=past',
};
describe('public schedule history', () => {
  it.each(['daily', 'weekly', 'monthly'] as const)('keeps past classes visible without booking links in %s', view => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-03T16:00:00Z'));
    const { container } = render(<WeeklyCalendar slots={[slot]} initialDateKey="2026-11-01" initialView={view} />);
    expect(screen.getByText('Sunday Yoga')).toBeTruthy();
    expect(screen.getByText(/Past class/)).toBeTruthy();
    expect(container.querySelector('a[href*="occurrence=past"]')).toBeNull();
  });
  it('still offers booking for future occurrences and labels past events', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-03T16:00:00Z'));
    const { container } = render(<WeeklyCalendar slots={[{ ...slot, isEvent: true }, { ...slot, id: 'future', startsAt: '2026-11-04T14:00:00Z', dateKey: '2026-11-04', bookingHref: '/book/yoga?occurrence=future' }]} initialDateKey="2026-11-01" initialView="monthly" />);
    expect(screen.getByText(/Past event/)).toBeTruthy();
    expect(container.querySelector('a[href*="occurrence=future"]')).toBeTruthy();
  });
});
