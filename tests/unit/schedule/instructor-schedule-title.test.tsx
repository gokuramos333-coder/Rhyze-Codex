// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import Page from '@/app/(portal)/instructor/schedule/page';
vi.stubGlobal('React', React);
vi.mock('@/lib/auth/session', () => ({
  requireArea: vi.fn(async () => ({
    id: 'assigned',
    name: 'Dennisse Mendoza',
    email: 'instructor@example.test',
  })),
}));
vi.mock('@/components/live/LiveDataRefresh', () => ({
  LiveDataRefresh: () => null,
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    classOccurrence: {
      findMany: vi.fn(async () => [
        {
          id: 'date',
          instructorId: 'assigned',
          instructor: { name: 'Dennisse Mendoza' },
          titleOverride: 'Real Riddim with Dennisse',
          template: { name: 'Real Riddim with Vanessa', isEvent: false },
          status: 'SCHEDULED',
          startAt: new Date('2026-10-10T16:00Z'),
          room: null,
          bookings: [],
          commerceOrders: [],
          capacity: 20,
          historicalSignupCount: 0,
          _count: { bookings: 0 },
        },
      ]),
    },
  },
}));
afterEach(cleanup);
it('renders the occurrence title in the instructor list instead of the template owner name', async () => {
  render(await Page());
  expect(screen.getByText('Real Riddim with Dennisse')).toBeTruthy();
  expect(screen.queryByText('Real Riddim with Vanessa')).toBeNull();
});
