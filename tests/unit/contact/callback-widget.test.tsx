// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { CallbackScheduler } from '@/components/sections/CallbackScheduler';

const availability = {
  timezone: 'America/New_York',
  durationMinutes: 15,
  days: [
    { date: '2026-09-21', slots: [] },
    {
      date: '2026-09-22',
      slots: ['2026-09-22T15:00:00.000Z', '2026-09-22T16:00:00.000Z'],
    },
    { date: '2026-10-01', slots: ['2026-10-01T15:00:00.000Z'] },
  ],
};
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock
    .mockReset()
    .mockResolvedValue({ ok: true, json: async () => availability });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function selectAndFill() {
  fireEvent.click(await screen.findByRole('button', { name: '11:00 AM' }));
  fireEvent.change(screen.getByLabelText(/Your name/), {
    target: { value: 'Prospect' },
  });
  fireEvent.change(screen.getByLabelText(/Email address/), {
    target: { value: 'prospect@example.test' },
  });
  fireEvent.change(screen.getByLabelText(/Phone number/), {
    target: { value: '9735550100' },
  });
}
describe('callback calendar', () => {
  it('confirms a winter evening on the Eastern date, not the next UTC date', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...availability,
        days: [{ date: '2026-11-02', slots: ['2026-11-03T00:15:00.000Z'] }],
      }),
    });
    render(<CallbackScheduler />);
    fireEvent.click(await screen.findByRole('button', { name: '7:15 PM' }));
    fireEvent.change(screen.getByLabelText(/Your name/), {
      target: { value: 'Prospect' },
    });
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: 'prospect@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/Phone number/), {
      target: { value: '9735550100' },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        startAt: '2026-11-03T00:15:00.000Z',
        notification: 'sent',
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request callback' }));
    expect(
      await screen.findByText(
        'Monday, November 2 at 7:15 PM Eastern · 15 minutes',
      ),
    ).toBeTruthy();
  });
  it('shows Eastern times, disabled unavailable dates, and navigates across months', async () => {
    render(<CallbackScheduler />);
    expect(
      await screen.findByRole('button', { name: '11:00 AM' }),
    ).toBeTruthy();
    expect(screen.getByText(/All times are Eastern/)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: /Monday, September 21, 2026/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('October 2026')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /Thursday, October 1, 2026/ }),
    );
    expect(screen.getByText('Thursday, October 1')).toBeTruthy();
  });
  it('requires an explicit time and only confirms after a saved server response', async () => {
    render(<CallbackScheduler />);
    await screen.findByRole('button', { name: '11:00 AM' });
    expect(
      (
        screen.getByRole('button', {
          name: 'Request callback',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await selectAndFill();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        startAt: '2026-09-22T15:00:00.000Z',
        notification: 'sent',
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request callback' }));
    expect(await screen.findByText('Your callback is scheduled')).toBeTruthy();
    expect(screen.getByText(/Our team has been notified/)).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      name: 'Prospect',
      email: 'prospect@example.test',
      phone: '9735550100',
      startAt: '2026-09-22T15:00:00.000Z',
    });
  });
  it('clearly distinguishes a saved request whose notification is still pending', async () => {
    render(<CallbackScheduler />);
    await selectAndFill();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        startAt: '2026-09-22T15:00:00.000Z',
        notification: 'pending',
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request callback' }));
    expect(
      await screen.findByText(/notification is still pending/),
    ).toBeTruthy();
    expect(screen.queryByText(/Our team has been notified/)).toBeNull();
  });
  it('refreshes a conflicting slot while preserving contact information', async () => {
    render(<CallbackScheduler />);
    await selectAndFill();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'slot_unavailable',
        message: 'That time is no longer available.',
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request callback' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect((screen.getByLabelText(/Your name/) as HTMLInputElement).value).toBe(
      'Prospect',
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Request callback',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it('provides a useful fallback when availability cannot load', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    render(<CallbackScheduler />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: '(973) 506-8565' }).getAttribute('href'),
    ).toBe('tel:+19735068565');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
