// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  templateFindFirst: vi.fn(),
  occurrenceFindFirst: vi.fn(),
  bookingFindMany: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('not-found'); },
}));
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    <a href={href}>{children}</a>,
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    classTemplate: { findFirst: mocks.templateFindFirst },
    classOccurrence: { findFirst: mocks.occurrenceFindFirst },
    booking: { findMany: mocks.bookingFindMany },
  },
}));

import EventBookingPage from '@/app/book/event/[slug]/page';

afterEach(cleanup);

describe('dynamic event booking page', () => {
  beforeEach(() => {
    mocks.bookingFindMany.mockResolvedValue([]);
    mocks.templateFindFirst.mockResolvedValue({
      id: 'mommy_template',
      slug: 'mommy-and-me-dennisse',
      name: 'Mommy & Me',
      description: 'A 45-minute specialty event for a parent and child.',
      durationMinutes: 45,
      dropInPriceCents: 3_000,
      defaultCapacity: 25,
      imageUrl: null,
    });
    mocks.occurrenceFindFirst.mockResolvedValue({
      id: 'mommy_occurrence',
      startAt: new Date('2026-09-26T16:00:00Z'),
      endAt: new Date('2026-09-26T16:45:00Z'),
      capacity: 25,
      historicalSignupCount: 0,
      _count: { bookings: 0, waitlistEntries: 0 },
    });
  });

  it('shows the November ANY-event policy and occurrence duration, not the template default', async () => {
    mocks.occurrenceFindFirst.mockResolvedValue({ id: 'november', startAt: new Date('2026-11-15T17:00Z'), endAt: new Date('2026-11-15T18:15Z'), capacity: 25, historicalSignupCount: 0, instructor: { name: 'Tricia Johnsen' }, _count: { bookings: 0, waitlistEntries: 0 } });
    render(await EventBookingPage({ params: Promise.resolve({ slug: 'mommy-and-me-dennisse' }) }));
    expect(document.body.textContent).toContain('75 min');
    expect(document.body.textContent).toContain('ANY event, including Tricia');
    expect(document.body.textContent).toContain('no rollover');
    expect(document.body.textContent).not.toContain('monthly selection');
  });
  it('books a database-created event that has no static fallback entry', async () => {
    render(await EventBookingPage({
      params: Promise.resolve({ slug: 'mommy-and-me-dennisse' }),
    }));

    expect(screen.getByText('Mommy & Me')).toBeTruthy();
    expect(document.body.textContent).toContain('45 min');
    expect(screen.getByLabelText('Number of children')).toBeTruthy();
  });

  it('shows the assigned instructor for an existing event', async () => {
    mocks.occurrenceFindFirst.mockResolvedValue({
      id: 'assigned_event',
      startAt: new Date('2026-09-24T23:15:00Z'),
      endAt: new Date('2026-09-25T00:00:00Z'),
      capacity: 25,
      historicalSignupCount: 0,
      instructor: { name: 'Nicole Finley' },
      substituteInstructorName: null,
      _count: { bookings: 0, waitlistEntries: 0 },
    });

    render(await EventBookingPage({
      params: Promise.resolve({ slug: 'mommy-and-me-dennisse' }),
    }));

    expect(screen.getByText(/Nicole Finley/)).toBeTruthy();
  });
});
