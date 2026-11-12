// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ClientArchiveControls } from '@/components/admin/ClientArchiveControls';
afterEach(cleanup);
it('offers archive without any client deletion control', async () => {
  const action = vi.fn(async (_form: FormData) => ({
    ok: true,
    message: 'Client archived.',
  }));
  render(
    <ClientArchiveControls
      userId="client"
      state={{ archived: false, effectivelyArchived: false, reasons: [] }}
      action={action}
    />,
  );
  expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Archive client' }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(action.mock.calls[0]?.[0].get('operation')).toBe('archive');
  expect(action.mock.calls[0]?.[0].get('userId')).toBe('client');
});
it('disables archive for obligations but allows explicit restore of a resurfaced client', () => {
  const action = vi.fn();
  const { rerender } = render(
    <ClientArchiveControls
      userId="client"
      state={{
        archived: false,
        effectivelyArchived: false,
        reasons: ['Active billing'],
      }}
      action={action}
    />,
  );
  expect(
    (
      screen.getByRole('button', {
        name: 'Archive client',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  rerender(
    <ClientArchiveControls
      userId="client"
      state={{
        archived: true,
        effectivelyArchived: false,
        reasons: ['Active billing'],
      }}
      action={action}
    />,
  );
  expect(
    (
      screen.getByRole('button', {
        name: 'Restore client',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(screen.getByText(/Visible again/)).toBeTruthy();
});
