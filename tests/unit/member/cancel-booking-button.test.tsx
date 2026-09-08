// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CancelBookingButton } from '@/components/member/CancelBookingButton';
import { cancellationPolicyDecision } from '@/lib/domain/bookings/cancellation-policy';

describe('CancelBookingButton', () => {
  afterEach(() => cleanup());
  const startAt = new Date('2026-08-21T18:00:00.000Z');

  it('opens a confirmation for every cancellation and keeps the safe choice visible', () => {
    const decision = cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T10:00:00.000Z'),
      accessType: 'STANDARD',
      isEvent: false,
      hasReservedCredit: true,
    });
    render(<CancelBookingButton bookingId="booking_1" decision={decision} action={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByText(/class credit will be returned/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keep my class' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel and return my credit' })).toBeVisible();
  });

  it('routes a standard six-hour cancellation to the $5 reschedule flow', () => {
    const decision = cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T14:00:00.000Z'),
      accessType: 'STANDARD',
      isEvent: false,
      hasReservedCredit: true,
    });
    render(<CancelBookingButton bookingId="booking_2" decision={decision} action={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText(/\$5 transfer fee/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Choose another class' })).toHaveAttribute(
      'href',
      '/member/bookings/reschedule?booking=booking_2',
    );
  });

  it('states the exact trial and VIP late-cancellation charges', () => {
    const trial = cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T17:00:00.000Z'),
      accessType: 'INTRO_TRIAL',
      isEvent: false,
      hasReservedCredit: false,
    });
    const { rerender } = render(
      <CancelBookingButton bookingId="trial_booking" decision={trial} action={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(/\$10 late-cancellation fee/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel and charge $10' })).toBeVisible();

    const vip = cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T17:00:00.000Z'),
      accessType: 'VIP',
      isEvent: false,
      hasReservedCredit: false,
    });
    rerender(<CancelBookingButton bookingId="vip_booking" decision={vip} action={vi.fn()} />);
    expect(screen.getByText(/\$10 late-cancellation fee/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel and charge $10' })).toBeVisible();
  });

  it('requires members to acknowledge the event cancellation rule before proceeding', () => {
    const decision = cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T14:30:00.000Z'),
      accessType: 'VIP',
      isEvent: true,
      hasReservedCredit: false,
    });
    render(<CancelBookingButton bookingId="event_booking" decision={decision} action={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText(/cancelations within 6hrs have a transfer fee of \$5/i)).toBeVisible();
    expect(screen.getByText(/rebook another event within 30 days/i)).toBeVisible();
    const proceed = screen.getByRole('button', { name: 'I understand — cancel and charge $5' });
    expect(proceed).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I understand this event cancellation policy/i));
    expect(proceed).toBeEnabled();
  });

  it('closes without submitting when the member keeps the class', () => {
    const action = vi.fn();
    const decision = cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T17:00:00.000Z'),
      accessType: 'STANDARD',
      isEvent: false,
      hasReservedCredit: true,
    });
    render(<CancelBookingButton bookingId="booking_3" decision={decision} action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Keep my class' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
});
