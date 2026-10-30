// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ClassList } from '@/components/sections/ClassList';
import { WeeklyCalendar } from '@/components/sections/WeeklyCalendar';
import { AdminClassesCalendar } from '@/components/admin/AdminClassesCalendar';
vi.mock('next/image', () => ({ default: () => null }));
beforeEach(() => { vi.stubGlobal('React', React); history.replaceState(null, '', '/'); });
afterEach(cleanup);
it.each(['day', 'week', 'month'] as const)('shows the exact orange holiday greeting without a class in admin %s', view => {
  const { container } = render(<AdminClassesCalendar occurrences={[]} selectedDateKey="2026-11-26" view={view} />);
  const notice = screen.getByText('Happy Thanksgiving!');
  expect(notice.className).toContain('text-rhyze-orange');
  expect(container.querySelectorAll('article')).toHaveLength(0);
});
const id = 'schedule-import-3376a9a49f3424d31f5af9223856';
const slug = 'seat-seduction-vanessa';
const event = { slug, name: 'Seat Seduction with Vanessa', category: 'dance' as const, duration: 75, tagline: 'Seat Seduction', description: 'Original event description', whatToExpect: [], isEvent: true };
it('discovers the existing event in Classes with a highlighted Events filter and event destination', () => {
  render(<ClassList catalog={[event, { ...event, slug: 'regular', name: 'Regular Dance', isEvent: false }]} />);
  const tab = screen.getByRole('tab', { name: 'Events' });
  expect(tab.className).toContain('rhyze-gold');
  fireEvent.click(tab);
  expect(screen.queryByText('Regular Dance')).toBeNull();
  expect(screen.getByText(event.name)).toBeTruthy();
  expect(screen.getByText('Event')).toBeTruthy();
  expect(screen.getByRole('link').getAttribute('href')).toBe(`/events/${slug}`);
  fireEvent.click(screen.getByRole('tab', { name: 'Dance' }));
  expect(screen.queryByText(event.name)).toBeNull();
  expect(screen.getByText('Regular Dance')).toBeTruthy();
});
const slot = { id, dateKey: '2026-11-13', dayLabel: 'Friday', shortDay: 'Fri', dateLabel: 'Nov 13', timeLabel: '7:30 PM', className: event.name, category: 'Dance', instructor: 'Vanessa Ramos', photo: "/teacher.jpg", isEvent: true, isSubstitute: false, room: 'Rhyze Floor', duration: '75 min', capacity: 16, booked: 0, waitlist: 0, price: '$30', bookingHref: `/events/${slug}?occurrence=${id}` };
it('offers a highlighted Events filter inside Admin Classes and keeps it during navigation', () => {
  render(<AdminClassesCalendar kind="events" selectedDateKey="2026-11-13" view="day" occurrences={[
    { ...slot, attended: 0, attendanceUnmarked: 0, isPast: false, status: 'SCHEDULED', cancellationReason: null },
    { ...slot, id: 'regular', className: 'Regular Dance', isEvent: false, attended: 0, attendanceUnmarked: 0, isPast: false, status: 'SCHEDULED', cancellationReason: null },
  ]} />);
  const filter = screen.getByRole('link', { name: 'Events' });
  expect(filter.className).toContain('rhyze-gold');
  expect(filter.getAttribute('aria-current')).toBe('page');
  expect(screen.queryByText('Regular Dance')).toBeNull();
  expect(screen.getByRole('link', { name: 'Next week' }).getAttribute('href')).toContain('kind=events');
});
it('filters homepage calendar by Events without changing its occurrence or booking destination', () => {
  render(<WeeklyCalendar compact initialDateKey="2026-11-13" slots={[slot, { ...slot, id: 'regular', className: 'Regular Dance', isEvent: false }]} />);
  fireEvent.click(screen.getByRole('button', { name: /^Events$/ }));
  expect(screen.queryByText('Regular Dance')).toBeNull();
  expect(screen.getByText(event.name)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'BOOK' }).getAttribute('href')).toBe(slot.bookingHref);
});
it.each(['day', 'week', 'month', 'year', 'custom'] as const)('labels the existing admin occurrence as Event in %s without creating a second roster', view => {
  render(<AdminClassesCalendar selectedDateKey="2026-11-13" view={view} occurrences={[{ ...slot, attended: 0, attendanceUnmarked: 0, isPast: false, status: 'SCHEDULED', cancellationReason: null }]} />);
  expect(screen.getByText('Event')).toBeTruthy();
  if (view !== 'month') {
    expect(screen.getByRole('link', { name: 'Attendees' }).getAttribute('href')).toBe(`/admin/schedule/${id}/roster`);
    expect(screen.queryByRole('link', { name: 'Cancel class' })).toBeNull();
  }
});
it('merges display queries while retaining class-only financial and client metrics', () => {
  const admin = readFileSync('app/(studio)/admin/classes/page.tsx', 'utf8');
  const calendarQuery = admin.slice(admin.indexOf('prisma.classOccurrence.findMany'), admin.indexOf('const templates ='));
  expect(calendarQuery).not.toContain('isEvent: false');
  expect(admin).toContain('isEvent: isPublicEvent(occurrence.template)');
  expect(admin).toContain("product: { kind: 'DROP_IN' }");
  expect(admin).toContain("contentType: 'Live Class'");
  expect(admin).toContain('occurrence: { template: { isEvent: false } }');
  const catalog = readFileSync('app/classes/page.tsx', 'utf8');
  expect(catalog).toContain('publicClassCatalogWhere(');
});
