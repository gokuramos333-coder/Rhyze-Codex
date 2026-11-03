// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/app/(studio)/admin/classes/[templateId]/upcoming-actions', () => ({
  editUpcomingClassesAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import {
  UpcomingClassEditor,
  type EditableClassDate,
} from '@/components/admin/UpcomingClassEditor';
const dates: EditableClassDate[] = [
  ['today', '2026-11-03T23:00:00Z'],
  ['later', '2026-11-10T23:00:00Z'],
  ['next-month', '2026-12-01T23:00:00Z'],
].map(([id, startAt]) => ({
  id,
  startAt,
  endAt: new Date(+new Date(startAt) + 3000000).toISOString(),
  updatedAt: '2026-11-03T12:00:00Z',
  title: 'Original ' + id,
  instructorId: null,
  instructor: 'TBA',
  capacity: 20,
  priceCents: 2500,
  publicNotes: null,
}));
const props = {
  templateId: 'format',
  dates,
  nowLabel: 'Nov 3, 2026',
  nowLocal: '2026-11-03T12:00',
  instructors: [],
};
afterEach(cleanup);
const data = () => new FormData(screen.getByRole('form') as HTMLFormElement);
describe('one-page monthly class editor', () => {
  it('shows editable details and current month; only dirty fields are submitted as changes', () => {
    render(<UpcomingClassEditor {...props} />);
    expect(screen.getByLabelText('Month')).toHaveValue('2026-11');
    expect(screen.getByLabelText('Class name')).toHaveValue('Original today');
    expect(
      screen.getByLabelText('Class description / information'),
    ).toBeVisible();
    expect(screen.getByLabelText('Date and time for today')).toHaveValue(
      '2026-11-03T18:00',
    );
    expect(data().getAll('occurrenceId')).toEqual(['today']);
    expect(data().has('changeName')).toBe(false);
    fireEvent.change(screen.getByLabelText('Class name'), {
      target: { value: 'Monthly name' },
    });
    expect(data().get('changeName')).toBe('on');
    expect(data().has('changeCapacity')).toBe(false);
    expect(data().has('start:today')).toBe(false);
    expect(
      screen.getByRole('button', { name: 'Save class & schedule' }),
    ).toBeEnabled();
  });
  it('selects the month and sends only explicitly changed New Jersey dates/times', () => {
    render(<UpcomingClassEditor {...props} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Select all dates in this month' }),
    );
    expect(data().getAll('occurrenceId')).toEqual(['today', 'later']);
    fireEvent.change(screen.getByLabelText('Date and time for later'), {
      target: { value: '2026-11-12T19:10' },
    });
    expect(data().get('start:later')).toBe('2026-11-12T19:10');
    expect(data().has('start:today')).toBe(false);
    expect(screen.getByText(/2026-11-12 at 19:10/)).toBeVisible();
  });
  it('expands weekly dates, skips already scheduled slots and does not overwrite existing details just to add dates', () => {
    render(<UpcomingClassEditor {...props} />);
    fireEvent.change(screen.getByLabelText('First date & time'), {
      target: { value: '2026-11-03T18:00' },
    });
    fireEvent.change(screen.getByLabelText('Repeat weekly through'), {
      target: { value: '2026-11-30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add weekly dates' }));
    expect(data().getAll('newStartAt')).toEqual([
      '2026-11-17T18:00',
      '2026-11-24T18:00',
    ]);
    expect(data().has('changePrice')).toBe(false);
  });
  it('allows exact new dates when a class has no upcoming schedule', () => {
    render(
      <UpcomingClassEditor
        {...props}
        dates={[]}
        defaults={{ title: 'New class', publicNotes: 'Details' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add one date' }));
    fireEvent.change(screen.getByLabelText('New date 1'), {
      target: { value: '2026-11-20T17:00' },
    });
    expect(data().getAll('newStartAt')).toEqual(['2026-11-20T17:00']);
    expect(data().get('title')).toBe('New class');
    expect(data().get('changeName')).toBe('on');
  });
});
