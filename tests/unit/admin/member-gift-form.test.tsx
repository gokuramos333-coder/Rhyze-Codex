// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemberGiftForm } from '@/components/admin/MemberGiftForm';
afterEach(cleanup);
it('keeps gift selection and idempotency key on failure/retry and disables after success', async () => {
  const action = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, message: 'Try again unchanged' })
    .mockResolvedValueOnce({ ok: true, message: 'Saved' });
  render(
    <MemberGiftForm
      userId="fixture"
      memberName="Fixture Member"
      requestId="ad4f1107-4f2b-43d1-b20e-9ec0def71ff9"
      defaultExpiry="2026-11-30"
      action={action}
    />,
  );
  fireEvent.change(screen.getByLabelText(/Gift can be used/), {
    target: { value: 'BOTH' },
  });
  fireEvent.change(screen.getByLabelText(/Occasion/), {
    target: { value: 'Milestone' },
  });
  fireEvent.change(screen.getByLabelText(/Reason/), {
    target: { value: '25 recorded visits' },
  });
  const button = screen.getByRole('button', { name: 'Add 1 gift credit' });
  fireEvent.click(button);
  await screen.findByText('Try again unchanged');
  expect(
    (screen.getByLabelText(/Gift can be used/) as HTMLSelectElement).value,
  ).toBe('BOTH');
  fireEvent.click(button);
  await screen.findByText('Saved');
  expect(action).toHaveBeenCalledTimes(2);
  for (const [form] of action.mock.calls) {
    expect(form.get('kind')).toBe('BOTH');
    expect(form.get('reason')).toBe('25 recorded visits');
    expect(form.get('requestId')).toBe('ad4f1107-4f2b-43d1-b20e-9ec0def71ff9');
  }
  await waitFor(() =>
    expect((button.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(
      true,
    ),
  );
});
