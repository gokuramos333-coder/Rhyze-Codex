// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar';
vi.mock('next/image', () => ({ default: () => null }));
afterEach(cleanup);
describe('November 2026 Thanksgiving display-only greeting', () => {
  it.each(['daily', 'weekly', 'monthly'] as const)('shows one orange non-bookable greeting on November 26 in %s', (view) => {
    const { container } = render(<WeeklyCalendar slots={[]} initialDateKey="2026-11-26" initialView={view} />);
    const notice = screen.getByText('Happy Thanksgiving');
    expect(notice.getAttribute('data-calendar-notice-date')).toBe('2026-11-26');
    expect(notice.className).toContain('text-rhyze-orange');
    expect(notice.className).toContain('break-words');
    expect(notice.closest('a, button')).toBeNull();
    expect(container.querySelectorAll('[data-schedule-slot]')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
  it.each(['2026-11-25', '2026-11-27', '2027-11-26'])('does not label a different daily date %s', (date) => {
    render(<WeeklyCalendar slots={[]} initialDateKey={date} />);
    expect(screen.queryByText('Happy Thanksgiving')).toBeNull();
  });
  it('does not repeat Thanksgiving in another month', () => {
    render(<WeeklyCalendar slots={[]} initialDateKey="2026-12-26" initialView="monthly" />);
    expect(screen.queryByText('Happy Thanksgiving')).toBeNull();
  });
  it('preserves existing Labor Day notice', () => {
    render(<WeeklyCalendar slots={[]} initialDateKey="2026-09-07" />);
    expect(screen.getByText('LABOR DAY!')).toBeTruthy();
  });
});
