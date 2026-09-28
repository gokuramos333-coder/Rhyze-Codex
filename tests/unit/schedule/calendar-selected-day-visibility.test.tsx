// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminClassesCalendar } from '@/components/admin/AdminClassesCalendar';
import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar';
import { resolveScheduleOccurrenceRange } from '@/lib/admin/schedule-occurrence-range';

vi.mock('next/image', () => ({ default: () => null }));

let viewportWidth = 280;
const stripLabel = 'Choose a day this week';
function expectSelectedVisible(label = 'Sep 27') {
  const strip = screen.getByLabelText(stripLabel);
  const selected = strip.querySelector('[aria-current="date"], [aria-pressed="true"]')!;
  expect(selected.textContent).toContain(label);
  expect(selected.getBoundingClientRect().left).toBeGreaterThanOrEqual(strip.getBoundingClientRect().left);
  expect(selected.getBoundingClientRect().right).toBeLessThanOrEqual(strip.getBoundingClientRect().right);
}

beforeEach(() => {
  vi.stubGlobal('React', React);
  viewportWidth = 280;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('aria-label') === stripLabel ? viewportWidth : 120;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(888);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute('aria-label') === stripLabel) return new DOMRect(40, 0, viewportWidth, 96);
    const parent = this.parentElement;
    if (parent?.getAttribute('aria-label') === stripLabel) {
      const index = Array.from(parent.children).indexOf(this);
      return new DOMRect(40 + index * 128 - parent.scrollLeft, 0, 120, 96);
    }
    return new DOMRect();
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('mobile Daily calendar selected-date visibility', () => {
  it('opens Admin Daily on the current Eastern date, visible even on Sunday after UTC midnight', () => {
    const range = resolveScheduleOccurrenceRange({ range: 'day' }, new Date('2026-09-28T02:18:00Z'), 'day');
    expect(range.dateKey).toBe('2026-09-27');
    render(<AdminClassesCalendar occurrences={[]} view="day" selectedDateKey={range.dateKey} />);
    expectSelectedVisible();
  });

  it('reveals the selected date when switching the public calendar to Daily', () => {
    render(<WeeklyCalendar slots={[]} initialDateKey="2026-09-27" initialView="monthly" />);
    fireEvent.click(screen.getByRole('button', { name: 'Daily' }));
    expectSelectedVisible();
    const strip = screen.getByLabelText(stripLabel);
    fireEvent.click(strip.querySelector('[data-week-date="2026-09-21"]')!);
    expect(strip.scrollLeft).toBe(0);
    expect(strip.querySelector('[aria-pressed="true"]')?.textContent).toContain('Sep 21');
  });

  it('reveals a manually selected Admin date after navigation', () => {
    const { rerender } = render(<AdminClassesCalendar occurrences={[]} view="day" selectedDateKey="2026-09-27" />);
    expectSelectedVisible();
    rerender(<AdminClassesCalendar occurrences={[]} view="day" selectedDateKey="2026-09-23" />);
    expectSelectedVisible('Sep 23');
  });

  it('reveals the date after resizing from desktop to mobile without scrolling the page', () => {
    viewportWidth = 1200;
    const pageScroll = vi.spyOn(window, 'scrollTo');
    render(<AdminClassesCalendar occurrences={[]} view="day" selectedDateKey="2026-09-27" />);
    viewportWidth = 280;
    fireEvent(window, new Event('resize'));
    expectSelectedVisible();
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it('preserves the full week on wide screens', () => {
    viewportWidth = 1200;
    render(<AdminClassesCalendar occurrences={[]} view="day" selectedDateKey="2026-09-27" />);
    expectSelectedVisible();
    expect(screen.getByLabelText(stripLabel).scrollLeft).toBe(0);
  });
});
