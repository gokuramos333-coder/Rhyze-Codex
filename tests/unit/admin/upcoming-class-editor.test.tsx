// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/app/(studio)/admin/classes/[templateId]/upcoming-actions', () => ({
  editUpcomingClassesAction: vi.fn(),
}));
import {
  UpcomingClassEditor,
  type EditableClassDate,
} from '@/components/admin/UpcomingClassEditor';
const dates: EditableClassDate[] = [
  ['today', '2026-11-03T23:00:00Z'],
  ['week', '2026-11-07T16:00:00Z'],
  ['later', '2026-11-10T23:00:00Z'],
].map(([id, startAt]) => ({
  id,
  startAt,
  endAt: new Date(+new Date(startAt) + 3000000).toISOString(),
  updatedAt: '2026-11-03T12:00:00Z',
  title: 'Original ' + id,
  instructorId: null,
  instructor: 'Instructor TBA',
  capacity: 20,
  priceCents: 2500,
  publicNotes: null,
}));
const props = {
  templateId: 'format',
  dates,
  weekEnd: '2026-11-09T05:00:00Z',
  nowLabel: 'Tue, Nov 3, 2026, 12:00 PM EST',
  instructors: [],
};
afterEach(cleanup);
describe('upcoming class date selector', () => {
  it('starts with this week and the nearest date; name-only submission has no rescheduling fields', () => {
    render(<UpcomingClassEditor {...props} />);
    expect(screen.getByRole('button', { name: 'This week' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const form = screen.getByRole('form', {
      name: 'Edit upcoming classes',
    }) as HTMLFormElement;
    const data = new FormData(form);
    expect(data.getAll('occurrenceId')).toEqual(['today']);
    expect(data.get('title')).toBe('Original today');
    expect(data.get('changeName')).toBe('on');
    for (const key of [
      'startAt',
      'endAt',
      'durationMinutes',
      'price',
      'capacity',
      'instructorId',
      'tags',
    ])
      expect(data.has(key)).toBe(false);
    expect(
      screen.getByRole('button', { name: 'Save 1 selected date' }),
    ).toBeEnabled();
  });
  it('supports an exact date range and explicitly includes only selected dates; preserves a typed new name', () => {
    render(<UpcomingClassEditor {...props} />);
    fireEvent.change(screen.getByLabelText('New class name'), {
      target: { value: 'New name' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose dates' }),
    );
    fireEvent.change(screen.getByLabelText('From (New Jersey)'), {
      target: { value: '2026-11-10' },
    });
    fireEvent.change(screen.getByLabelText('Through (New Jersey)'), {
      target: { value: '2026-11-10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Select shown dates' }));
    const data = new FormData(screen.getByRole('form') as HTMLFormElement);
    expect(data.getAll('occurrenceId')).toEqual(['later']);
    expect(data.get('title')).toBe('New name');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(
      screen.getByRole('button', { name: 'Save 0 selected dates' }),
    ).toBeDisabled();
  });
  it('points an empty upcoming schedule to the real schedule-creation page', () => {
    render(<UpcomingClassEditor {...props} dates={[]} />);
    expect(
      screen.getByRole('link', { name: 'Add a scheduled date' }),
    ).toHaveAttribute('href', '/admin/schedule');
  });
});
