import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RescheduleClassPicker } from '@/components/member/RescheduleClassPicker';

const destinations = [
  {
    id: 'class-one',
    startAt: new Date('2026-08-05T14:00:00.000Z'),
    timezone: 'America/New_York',
    capacity: 25,
    historicalSignupCount: 3,
    _count: { bookings: 4 },
    template: { name: 'Pilates Pulse with Adrianna' },
    instructor: { name: 'Adrianna Jones' },
  },
  {
    id: 'class-two',
    startAt: new Date('2026-08-05T16:00:00.000Z'),
    timezone: 'America/New_York',
    capacity: 25,
    historicalSignupCount: 0,
    _count: { bookings: 1 },
    template: { name: 'Ignite with Julie' },
    instructor: { name: 'Julie Reese' },
  },
];

describe('mobile reschedule class picker', () => {
  it('renders each destination as a required, full-width radio card', () => {
    const markup = renderToStaticMarkup(
      <RescheduleClassPicker destinations={destinations} />,
    );

    expect(markup.match(/type="radio"/g)).toHaveLength(2);
    expect(markup.match(/name="destinationId"/g)).toHaveLength(2);
    expect(markup).toContain('required=""');
    expect(markup).toContain('Pilates Pulse with Adrianna');
    expect(markup).toContain('Adrianna Jones');
    expect(markup).toContain('18 spots available');
    expect(markup).toContain('w-full');
    expect(markup).toContain('min-w-0');
    expect(markup).toContain('peer-checked:border-rhyze-orange');
  });

  it('explains when no eligible classes are available', () => {
    const markup = renderToStaticMarkup(
      <RescheduleClassPicker destinations={[]} />,
    );

    expect(markup).toContain('No eligible classes are available');
  });
});
