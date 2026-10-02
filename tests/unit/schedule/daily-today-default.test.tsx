// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar';
import type { PublicCalendarSlot } from '@/lib/domain/schedule/public-calendar';

vi.mock('next/image', () => ({ default: () => null }));
const slot = (dateKey: string): PublicCalendarSlot => ({
  id: dateKey, dateKey, dayLabel: 'Sunday', shortDay: 'Sun', dateLabel: 'Oct 4',
  timeLabel: '9:00 AM', className: `Class ${dateKey}`, category: 'Dance',
  instructor: 'Test', photo: '/test.jpg', isEvent: false, isSubstitute: false,
  room: 'Studio', duration: '50 min', capacity: 20, booked: 0, waitlist: 0,
  price: '$25', bookingHref: `/book/test?occurrence=${dateKey}`,
});
const selected = () => screen.getByLabelText('Choose a day this week')
  .querySelector('[aria-pressed="true"]')?.getAttribute('data-week-date');
const select = (dateKey: string) => fireEvent.click(screen.getByLabelText('Choose a day this week')
  .querySelector(`[data-week-date="${dateKey}"]`)!);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T09:00:00Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('public Daily studio-today default', () => {
  it('keeps empty today selected instead of the next class date', () => {
    render(<WeeklyCalendar slots={[slot('2026-10-04')]} />);
    expect(selected()).toBe('2026-10-02');
    expect(screen.getByText('No classes scheduled today.')).toBeTruthy();
    expect(screen.queryByText('Class 2026-10-04')).toBeNull();
  });
  it('shows the same today empty state when there are no slots', () => {
    render(<WeeklyCalendar slots={[]} />);
    expect(selected()).toBe('2026-10-02');
    expect(screen.getByText('No classes scheduled today.')).toBeTruthy();
  });
  it('shows today classes even when another slot is first', () => {
    render(<WeeklyCalendar slots={[slot('2026-10-04'), slot('2026-10-02')]} />);
    expect(selected()).toBe('2026-10-02');
    expect(screen.getByText('Class 2026-10-02')).toBeTruthy();
    expect(screen.queryByText('No classes scheduled today.')).toBeNull();
  });
  it('respects an explicit future date and its booking link', () => {
    render(<WeeklyCalendar slots={[slot('2026-10-04')]} initialDateKey="2026-10-04" />);
    expect(selected()).toBe('2026-10-04');
    expect(screen.getByRole('link', { name: 'BOOK' }).getAttribute('href')).toBe('/book/test?occurrence=2026-10-04');
  });
  it('uses non-today copy for explicitly selected empty future dates', () => {
    render(<WeeklyCalendar slots={[]} initialDateKey="2026-10-03" />);
    expect(selected()).toBe('2026-10-03');
    expect(screen.getByText('No classes scheduled for this day.')).toBeTruthy();
    expect(screen.queryByText('No classes scheduled today.')).toBeNull();
  });
  it('preserves manual selections across view toggles, rerenders and week navigation', () => {
    const { rerender } = render(<WeeklyCalendar slots={[slot('2026-10-04')]} />);
    select('2026-10-04');
    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Daily' }));
    rerender(<WeeklyCalendar slots={[slot('2026-10-04')]} />);
    expect(selected()).toBe('2026-10-04');
    expect(screen.getByText('Class 2026-10-04')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(selected()).toBe('2026-10-11');
    expect(screen.getByText('No classes scheduled for this day.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    select('2026-10-02');
    expect(selected()).toBe('2026-10-02');
    expect(screen.getByText('No classes scheduled today.')).toBeTruthy();
  });
  it('allows monthly date selection to open Daily without resetting to today', () => {
    render(<WeeklyCalendar slots={[slot('2026-10-04')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Monthly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show October 4 schedule' }));
    expect(selected()).toBe('2026-10-04');
    expect(screen.getByText('Class 2026-10-04')).toBeTruthy();
  });
  it.each([
    ['2026-10-03T02:30:00Z', '2026-10-02'],
    ['2026-10-03T03:59:59Z', '2026-10-02'],
    ['2026-10-03T04:00:00Z', '2026-10-03'],
    ['2026-03-08T04:30:00Z', '2026-03-07'],
    ['2026-03-08T07:30:00Z', '2026-03-08'],
    ['2026-11-01T03:30:00Z', '2026-10-31'],
    ['2026-11-01T06:30:00Z', '2026-11-01'],
  ])('uses America/New_York at %s rather than browser/UTC date', (now, today) => {
    vi.setSystemTime(new Date(now));
    render(<WeeklyCalendar slots={[]} />);
    expect(selected()).toBe(today);
    expect(screen.getByText('No classes scheduled today.')).toBeTruthy();
  });
});
