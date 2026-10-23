// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventCheckoutButton } from '@/components/checkout/EventCheckoutButton';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('Mommy & Me checkout', () => {

  it('lets a parent choose children and sends that count for server pricing', async () => {
    const fetchRequest = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Test stopped before redirect.' }),
    });
    vi.stubGlobal('fetch', fetchRequest);

    render(
      <EventCheckoutButton
        slug="mommy-and-me-dennisse"
        occurrenceId="mommy_occurrence"
        familyPricing
      />,
    );

    fireEvent.change(screen.getByLabelText('Number of children'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Event Booking' }));

    await waitFor(() => expect(fetchRequest).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchRequest.mock.calls[0][1].body)).toEqual({
      slug: 'mommy-and-me-dennisse',
      childCount: 3,
      occurrenceId: 'mommy_occurrence',
    });
    expect(screen.getByText('$40 total')).toBeTruthy();
  });
});

 it('allows a newly opened event place to be purchased even when all five waitlist positions are filled', () => {
   render(<EventCheckoutButton slug="event" occurrenceId="date-two" soldOut={false} waitlistFull />);
   expect((screen.getByRole('button', { name: 'Confirm Event Booking' }) as HTMLButtonElement).disabled).toBe(false);
 });
 it('stops new waitlist joins when both the roster and the five-person waitlist are full', () => {
   render(<EventCheckoutButton slug="event" occurrenceId="date-two" soldOut waitlistFull />);
   expect((screen.getByRole('button', { name: /waitlist full/i }) as HTMLButtonElement).disabled).toBe(true);
 });
