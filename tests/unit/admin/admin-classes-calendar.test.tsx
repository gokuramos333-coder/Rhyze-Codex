// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminClassesCalendar,
  type AdminCalendarOccurrence,
} from '@/components/admin/AdminClassesCalendar';

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

const occurrences = [
  {
    id: 'past-class',
    dateKey: '2026-08-24',
    dayLabel: 'Monday',
    shortDay: 'Mon',
    dateLabel: 'Aug 24',
    timeLabel: '9:00 AM',
    duration: '50 min',
    className: 'Power Yoga with Kenzie',
    category: 'Yoga & Pilates',
    instructor: 'Kenzie',
    photo: null,
    capacity: 25,
    booked: 6,
    attended: 4,
    attendanceUnmarked: 1,
    isPast: true,
    waitlist: 0,
    status: 'COMPLETED',
    cancellationReason: null,
  },
  {
    id: 'next-class',
    dateKey: '2026-08-25',
    dayLabel: 'Tuesday',
    shortDay: 'Tue',
    dateLabel: 'Aug 25',
    timeLabel: '11:00 AM',
    duration: '50 min',
    className: 'Rhyze Ritmo with Melissa',
    category: 'Dance',
    instructor: 'Melissa',
    photo: null,
    capacity: 25,
    booked: 9,
    attended: 0,
    attendanceUnmarked: 0,
    isPast: false,
    waitlist: 1,
    status: 'SCHEDULED',
    cancellationReason: null,
  },
] satisfies Array<
  AdminCalendarOccurrence & {
    attended: number;
    attendanceUnmarked: number;
    isPast: boolean;
  }
>;

describe('Admin Classes calendar', () => {
  beforeEach(() => vi.stubGlobal('React', React));
  afterEach(() => cleanup());

  it('shows a selected historical day with all Admin class actions', () => {
    render(
      <AdminClassesCalendar
        occurrences={occurrences}
        view="day"
        selectedDateKey="2026-08-24"
      />,
    );

    expect(screen.getByText('Monday, August 24')).toBeInTheDocument();
    expect(screen.getByText('Power Yoga with Kenzie')).toBeInTheDocument();
    expect(screen.getByText('6/25 signups')).toBeInTheDocument();
    expect(screen.getByText('4 attended')).toBeInTheDocument();
    expect(screen.getByText('1 attendance unmarked')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/admin/schedule/past-class',
    );
    expect(screen.queryByRole('link', { name: 'Cancel class' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Attendees' })).toHaveAttribute(
      'href',
      '/admin/schedule/past-class/roster',
    );
    expect(screen.queryByText('PAST CLASSES')).not.toBeInTheDocument();
  });

  it('separates every day in weekly view and retains past classes', () => {
    render(
      <AdminClassesCalendar
        occurrences={occurrences}
        view="week"
        selectedDateKey="2026-08-24"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Monday' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tuesday' })).toBeInTheDocument();
    expect(screen.getByText('Power Yoga with Kenzie')).toBeInTheDocument();
    expect(screen.getByText('Rhyze Ritmo with Melissa')).toBeInTheDocument();
  });

  it('provides previous and next month arrows and opens a calendar date in daily view', () => {
    render(
      <AdminClassesCalendar
        occurrences={occurrences}
        view="month"
        selectedDateKey="2026-08-24"
      />,
    );

    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous month' })).toHaveAttribute(
      'href',
      '/admin/classes?range=month&date=2026-07-01#scheduled-classes',
    );
    expect(screen.getByRole('link', { name: 'Next month' })).toHaveAttribute(
      'href',
      '/admin/classes?range=month&date=2026-09-01#scheduled-classes',
    );
    expect(screen.getByRole('link', { name: 'Open August 24' })).toHaveAttribute(
      'href',
      '/admin/classes?range=day&date=2026-08-24#scheduled-classes',
    );
  });
});
