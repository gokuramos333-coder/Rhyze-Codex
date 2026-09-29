// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar';
import type { PublicCalendarSlot } from '@/lib/domain/schedule/public-calendar';
vi.mock('next/image', () => ({ default: () => null }));
const common: PublicCalendarSlot = {
  id: 'standard', dateKey: '2026-10-24', dayLabel: 'Saturday', shortDay: 'Sat', dateLabel: 'Oct 24', timeLabel: '10:00 AM',
  className: 'Standard Dance', category: 'Dance', instructor: 'Teacher', photo: '/teacher.jpg', isEvent: false, isSubstitute: false,
  room: 'Studio', duration: '50 min', capacity: 20, booked: 0, waitlist: 0, price: '$25', bookingHref: '/book/standard?occurrence=standard',
};
const event: PublicCalendarSlot = { ...common, id: 'event', className: 'Mommy & Me', isEvent: true, bookingHref: '/events/mommy?occurrence=event', price: '$30' };
afterEach(cleanup);
describe('public/member event visibility in the shared calendar', () => {
  it.each(['daily', 'weekly', 'monthly'] as const)('shows distinct event cards, boxed badges beside the format, and exact booking destinations in %s', (view) => {
    const { container } = render(<WeeklyCalendar initialDateKey="2026-10-24" initialView={view} slots={[common, event]} />);
    const eventCard = container.querySelector('[data-schedule-slot="event"]')!;
    const standardCard = container.querySelector('[data-schedule-slot="standard"]')!;
    expect(eventCard).toBeTruthy();
    expect(standardCard).toBeTruthy();
    const badge = within(eventCard as HTMLElement).getByText('Event');
    expect(badge.className).toContain('border');
    expect(badge.className).toContain('rounded-sm');
    expect(within(badge.parentElement!).getByText('Dance')).toBeTruthy();
    expect(eventCard.className).toContain('bg-rhyze-coral/20');
    expect(standardCard.className).not.toContain('bg-rhyze-coral/20');
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href') === event.bookingHref)).toBe(true);
    expect(screen.getAllByRole('link').some(link => link.getAttribute('href') === common.bookingHref)).toBe(true);
  });
  it('retains the event badge and event-specific route in the compact homepage calendar', () => {
    const { container } = render(<WeeklyCalendar compact initialDateKey="2026-10-24" slots={[event]} />);
    const card = container.querySelector('[data-schedule-slot="event"]')!;
    expect(within(card as HTMLElement).getByText('Event')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'BOOK' }).getAttribute('href')).toBe(event.bookingHref);
  });
});
