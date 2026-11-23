// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { SpecialEventRoster } from '@/lib/payments/special-event-roster';

import { BlackFridayPendingRoster } from '@/components/attendance/BlackFridayPendingRoster';

afterEach(cleanup);

const roster: SpecialEventRoster = {
  groups: [{
    orderId: 'order', cashPaidCents: 5000,
    attendees: [{
      role: 'GUEST', fullName: 'Avery Guest', phone: '+12015550190', userId: null,
      bookingId: null, contribution: 'CASH_TICKET', waiver: 'NEEDED', attendanceStatus: null,
      checkedInAt: null, markedById: null,
    }],
  }],
  linkedBookingIds: [], reviewItems: [], currentWaiverVersionId: 'current-waiver', canLinkAccounts: true,
};
const actions = {
  recordPaperWaiverAction: vi.fn(async () => true),
  checkInAction: vi.fn(async () => true),
  searchAccountsAction: vi.fn(async () => [{ id: 'guest-account', name: 'Avery Guest', phone: '+12015550190' }]),
  linkAccountAction: vi.fn(async () => true),
};

it('requires explicit signed-paper collection before a guest without a waiver can check in', async () => {
  render(<BlackFridayPendingRoster roster={roster} actions={actions} renderNativeAttendance={() => null} />);
  expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
  fireEvent.click(screen.getByText('Record paper waiver'));
  const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save waiver record' });
  expect(save.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('I collected the guest’s signed current paper waiver'));
  fireEvent.click(save);
  await waitFor(() => expect(actions.recordPaperWaiverAction).toHaveBeenCalledWith({
    orderId: 'order', displayedWaiverVersionId: 'current-waiver', paperCollected: true,
  }));
});

it('links a returned account only after staff find, select and confirm the match', async () => {
  render(<BlackFridayPendingRoster roster={roster} actions={actions} renderNativeAttendance={() => null} />);
  fireEvent.click(screen.getByText('Link guest account'));
  fireEvent.change(screen.getByLabelText('Guest name or phone'), { target: { value: 'Avery' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByRole('radio', { name: /Avery Guest.*201/ })).toBeTruthy();
  expect(actions.searchAccountsAction).toHaveBeenCalledWith({ orderId: 'order', query: 'Avery' });
  const link = screen.getByRole<HTMLButtonElement>('button', { name: 'Link selected account' });
  expect(link.disabled).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: /Avery Guest.*201/ }));
  expect(link.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('I verified this account belongs to the guest'));
  fireEvent.click(link);
  await waitFor(() => expect(actions.linkAccountAction).toHaveBeenCalledWith({
    orderId: 'order', selectedUserId: 'guest-account', identityConfirmed: true,
  }));
});
