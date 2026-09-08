// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassGallerySlideshow } from '@/components/sections/ClassGallerySlideshow';

const images = [
  { id: 'one', imageUrl: '/one.jpg', altText: 'First class photo', position: 0 },
  { id: 'two', imageUrl: '/two.jpg', altText: 'Second class photo', position: 1 },
];

describe('class gallery slideshow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('advances every four seconds and supports pause, previous, and next', () => {
    render(<ClassGallerySlideshow images={images} />);
    expect(screen.getByRole('img', { name: 'First class photo' })).toBeTruthy();

    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole('img', { name: 'Second class photo' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Pause slideshow' }));
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole('img', { name: 'Second class photo' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect(screen.getByRole('img', { name: 'First class photo' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByRole('img', { name: 'Second class photo' })).toBeTruthy();
  });
});
