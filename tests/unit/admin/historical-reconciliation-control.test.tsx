// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { HistoricalReconciliationControl } from '@/components/admin/HistoricalReconciliationControl';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockClear();
});
it('previews without mutation, applies explicitly, and continues the server cursor within the same date range', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, hasMore: false }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, hasMore: true, nextCursor: 'ch_next' }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, hasMore: false }),
    });
  vi.stubGlobal('fetch', fetch);
  render(
    <HistoricalReconciliationControl
      from="2026-08-01T04:00:00Z"
      to="2026-09-01T04:00:00Z"
      configured
    />,
  );
  fireEvent.click(screen.getByText('Preview selected dates'));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await screen.findByText(/Preview completed/);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    dryRun: true,
    from: '2026-08-01T04:00:00Z',
  });
  expect(refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Reconcile selected dates'));
  await screen.findByText('Continue next batch');
  expect(JSON.parse(fetch.mock.calls[1][1].body).dryRun).toBe(false);
  fireEvent.click(screen.getByText('Continue next batch'));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({
    dryRun: false,
    startingAfter: 'ch_next',
    to: '2026-09-01T04:00:00Z',
  });
});
