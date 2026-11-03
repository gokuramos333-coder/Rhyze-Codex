// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/(studio)/admin/classes/[templateId]/delete-actions', () => ({
  deleteClassScheduleAction: vi.fn(),
}));
import { DeleteClassSchedule } from '@/components/admin/DeleteClassSchedule';
const dates = [
  {
    id: 'one',
    startAt: '2026-11-10T23:00:00Z',
    updatedAt: 'version-one',
    label: 'Tue, Nov 10 at 6 PM · Dance',
    booked: 0,
    waiting: 0,
  },
  {
    id: 'two',
    startAt: '2026-12-01T23:00:00Z',
    updatedAt: 'version-two',
    label: 'Tue, Dec 1 at 6 PM · Dance',
    booked: 2,
    waiting: 1,
  },
];
afterEach(cleanup);
describe('delete class scope review', () => {
  it('starts collapsed, defaults to one date, and requires explicit confirmation', () => {
    render(<DeleteClassSchedule templateId="class" dates={dates} />);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete from schedule' }),
    );
    expect(screen.getByLabelText('This date only')).toBeChecked();
    expect(
      screen.getByText('No signups: no customer email will be sent.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete this date' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(
      screen.getByRole('button', { name: 'Delete this date' }),
    ).toBeEnabled();
  });
  it('lists all future months, warns about booked people, and clears confirmation when scope/date changes', () => {
    render(<DeleteClassSchedule templateId="class" dates={dates} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete from schedule' }),
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByLabelText('All future dates for this class'));
    expect(
      screen.getByRole('button', { name: 'Delete all 2 future dates' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Only people booked or waiting/),
    ).toBeInTheDocument();
    const f = new FormData(screen.getByRole('form') as HTMLFormElement);
    expect(JSON.parse(String(f.get('dates'))).map((d: any) => d.id)).toEqual([
      'one',
      'two',
    ]);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByLabelText('This date only'));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'two' },
    });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(
      JSON.parse(
        String(
          new FormData(screen.getByRole('form') as HTMLFormElement).get(
            'dates',
          ),
        ),
      ),
    ).toHaveLength(1);
  });
  it('does not allow deletion without a future date', () => {
    render(<DeleteClassSchedule templateId="class" dates={[]} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete from schedule' }),
    );
    expect(
      screen.getByText('There are no future dates to delete.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
});
