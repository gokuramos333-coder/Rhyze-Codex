// @vitest-environment jsdom
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminMembershipChangeForm } from '@/components/admin/AdminMembershipChangeForm';
afterEach(cleanup);
const quote = {
  id: 'quote',
  toName: 'Ritual',
  chargeCents: 1200,
  creditCents: 0,
  monthlyCents: 11900,
  effectiveAt: '2026-09-23T04:00Z',
  renewalAt: '2026-10-03T16:00Z',
  timing: 'NOW',
};
function props() {
  return {
    userId: 'u',
    membershipId: 'm',
    currentProductId: 'elevate',
    renewalAt: '2026-10-03T16:00Z',
    today: '2026-09-22',
    products: [{ id: 'ritual', name: 'Ritual', priceCents: 11900 }],
    quoteAction: vi.fn(async () => ({ quote })),
    confirmAction: vi.fn(async () => ({
      status: 'APPLIED',
      message: 'Membership updated.',
    })),
  };
}
it('requires review before confirmation and displays unchanged renewal and new monthly price', async () => {
  const p = props();
  render(<AdminMembershipChangeForm {...p} />);
  fireEvent.click(screen.getByText('Change membership'));
  expect(
    screen.queryByRole('button', { name: 'Confirm membership change' }),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText('New membership'), {
    target: { value: 'ritual' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Review change' }).closest('form')!,
  );
  await screen.findByRole('button', { name: 'Confirm membership change' });
  expect(screen.getByRole('heading', { name: /\$119.00.*month/ })).toBeTruthy();
  expect(screen.getByText(/Oct 3, 2026/)).toBeTruthy();
  expect(screen.getByText(/\$12.00/)).toBeTruthy();
  expect(p.confirmAction).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm membership change' }),
  );
  await screen.findByText('Membership updated.');
  expect(p.confirmAction.mock.calls).toHaveLength(1);
});
it('invalidates the reviewed quote after changing the selection', async () => {
  const p = props();
  render(<AdminMembershipChangeForm {...p} />);
  fireEvent.click(screen.getByText('Change membership'));
  fireEvent.submit(
    screen.getByRole('button', { name: 'Review change' }).closest('form')!,
  );
  await screen.findByRole('button', { name: 'Confirm membership change' });
  fireEvent.change(screen.getByLabelText('Start the change'), {
    target: { value: 'DATE' },
  });
  expect(
    screen.queryByRole('button', { name: 'Confirm membership change' }),
  ).toBeNull();
  expect(screen.getByLabelText('Start date (Eastern time)')).toBeTruthy();
});
it('shows an inline error, not a false success, when Stripe cannot quote', async () => {
  const p = {
    ...props(),
    quoteAction: vi.fn(async () => ({
      error: 'Stripe is unavailable. No change was made.',
    })),
  };
  render(<AdminMembershipChangeForm {...p} />);
  fireEvent.click(screen.getByText('Change membership'));
  fireEvent.submit(
    screen.getByRole('button', { name: 'Review change' }).closest('form')!,
  );
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'No change was made',
    ),
  );
  expect(
    screen.queryByRole('button', { name: 'Confirm membership change' }),
  ).toBeNull();
});
