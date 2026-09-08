// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventsCarousel } from '@/components/sections/EventsCarousel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  fireEvent(window, new Event('resize'));
}

describe('events carousel', () => {
  it('shows three events at a time on desktop and advances by one group', () => {
    setWidth(1200);
    render(
      <EventsCarousel>
        <article>Event one</article>
        <article>Event two</article>
        <article>Event three</article>
        <article>Event four</article>
      </EventsCarousel>,
    );

    expect(screen.getByText('Event one')).toBeTruthy();
    expect(screen.getByText('Event three')).toBeTruthy();
    expect(screen.queryByText('Event four')).toBeNull();
    expect(screen.getByRole('button', { name: 'Previous events' }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next events' }));

    expect(screen.queryByText('Event one')).toBeNull();
    expect(screen.getByText('Event four')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next events' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows one event at a time on small screens', () => {
    setWidth(480);
    render(
      <EventsCarousel>
        <article>Event one</article>
        <article>Event two</article>
      </EventsCarousel>,
    );

    expect(screen.getByText('Event one')).toBeTruthy();
    expect(screen.queryByText('Event two')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next events' }));
    expect(screen.getByText('Event two')).toBeTruthy();
  });

  it('does not render controls when all desktop cards fit', () => {
    setWidth(1200);
    render(
      <EventsCarousel>
        <article>Event one</article>
        <article>Event two</article>
        <article>Event three</article>
      </EventsCarousel>,
    );

    expect(screen.queryByRole('button', { name: 'Next events' })).toBeNull();
  });

  it('shows an empty state when there are no upcoming events', () => {
    render(<EventsCarousel>{[]}</EventsCarousel>);
    expect(screen.getByText(/No upcoming events are posted yet/i)).toBeTruthy();
  });
});
