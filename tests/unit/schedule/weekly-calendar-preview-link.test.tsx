// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    <a href={href}>{children}</a>,
}));

import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar';

afterEach(cleanup);

describe('schedule preview link', () => {
  it('can open directly to the requested month and view', () => {
    render(
      <WeeklyCalendar
        initialDateKey="2026-09-01"
        initialView="monthly"
        slots={[{
          id: 'mommy',
          dateKey: '2026-09-26',
          dayLabel: 'Saturday',
          shortDay: 'Sat',
          dateLabel: 'Sep 26',
          timeLabel: '12:00 PM',
          templateSlug: 'mommy-and-me-dennisse',
          className: 'Mommy & Me',
          category: 'Dance',
          instructor: 'Instructor TBA',
          photo: '/brand/rhyze-logo-header.png',
          isEvent: true,
          isSubstitute: false,
          room: 'Main Floor',
          duration: '45 min',
          capacity: 20,
          booked: 0,
          waitlist: 0,
          price: '$30',
          bookingHref: '/events/mommy-and-me-dennisse',
        }]}
      />,
    );

    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.getByLabelText('Monthly calendar')).toBeTruthy();
  });

  it('shows a Labor Day callout on September 7', () => {
    render(
      <WeeklyCalendar
        initialDateKey="2026-09-07"
        initialView="daily"
        slots={[{
          id: 'labor-day-pilates',
          dateKey: '2026-09-07',
          dayLabel: 'Monday',
          shortDay: 'Mon',
          dateLabel: 'Sep 7',
          timeLabel: '9:00 AM',
          templateSlug: 'pilates-pulse-adrianna',
          className: 'Pilates Pulse with Adrianna',
          category: 'Yoga & Pilates',
          instructor: 'Adrianna Jones',
          photo: '/founders/instructor-adriana.jpg',
          isEvent: false,
          isSubstitute: false,
          room: 'Main Floor',
          duration: '50 min',
          capacity: 25,
          booked: 0,
          waitlist: 0,
          price: '$25',
          bookingHref: '/book/pilates-pulse-adrianna',
        }]}
      />,
    );

    const classTitle = screen.getByRole('heading', {
      name: 'Pilates Pulse with Adrianna',
    });
    expect(
      within(classTitle.parentElement!).getByText('LABOR DAY!'),
    ).toBeTruthy();
  });
});
