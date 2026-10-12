// @vitest-environment jsdom
import React from 'react';
import { render, screen, within, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  classTemplate: { findMany: vi.fn() },
  classOccurrence: { findMany: vi.fn(), findFirst: vi.fn() },
  classCategory: { findMany: vi.fn() },
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: db }));
vi.mock('@/lib/admin/financial-report', () => ({
  loadFinancialReport: vi.fn().mockResolvedValue({ eventSummaries: [] }),
  financialReportQuery: (input: { occurrence: string }) => `occurrence=${input.occurrence}`,
  formatReportMoney: vi.fn(),
}));
vi.mock('@/components/admin/FinancialReportView', () => ({ FinancialReportView: () => <section aria-label="Financial report" /> }));
vi.mock('@/components/admin/AnalyticsRangeControls', () => ({ AnalyticsRangeControls: () => null }));
vi.mock('@/app/(studio)/admin/classes/actions', () => ({ createClassTemplateAction: vi.fn(), deleteClassTemplateAction: vi.fn() }));
import AdminEventsPage from '@/app/(studio)/admin/events/page';
import { loadFinancialReport } from '@/lib/admin/financial-report';

const template = {
  id: 'rachel', slug: 'soul-line-dancing-rachel', name: 'Soul Line Dancing with Rachel',
  isEvent: false, durationMinutes: 60, dropInPriceCents: 2500, imageUrl: '/rachel.jpg',
  category: { name: 'Dance' }, _count: { occurrences: 10 },
};
const upcoming = {
  id: 'rachel-oct16', startAt: new Date('2026-10-16T23:30Z'), endAt: new Date('2026-10-17T00:30Z'),
  timezone: 'America/New_York', status: 'SCHEDULED', priceCents: 1500, template,
  capacity: 25, historicalSignupCount: 0, instructor: { name: 'Rachel Crowe' }, _count: { bookings: 0 },
};
const old = { ...upcoming, id: 'rachel-aug4', startAt: new Date('2026-08-04T22:00Z'), priceCents: 2500 };
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-12T06:00Z'));
  vi.clearAllMocks();
  db.classTemplate.findMany.mockResolvedValue([{ ...template, occurrences: [old] }]);
  db.classOccurrence.findMany.mockResolvedValue([upcoming]);
  db.classOccurrence.findFirst.mockResolvedValue(upcoming);
  db.classCategory.findMany.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Rachel management under Admin Events', () => {
  it('includes the member-credit event in both management queries without converting its admission type', async () => {
    await AdminEventsPage({ searchParams: Promise.resolve({}) });
    const classification = { OR: [{ isEvent: true }, { isEvent: false, slug: template.slug }] };
    expect(db.classTemplate.findMany.mock.calls[0][0].where).toEqual(classification);
    expect(loadFinancialReport).toHaveBeenCalledWith({ kind: 'event' }, new Date(), [upcoming]);
    expect(db.classOccurrence.findMany.mock.calls[0][0].where).toMatchObject({
      template: classification, status: 'SCHEDULED',
      startAt: { gte: new Date('2026-10-01T04:00Z'), lte: new Date('2026-11-01T03:59:59.999Z') },
    });
  });
  it('shows Rachel’s next $15 event in the catalog instead of the old August class and $25 template price', async () => {
    render(await AdminEventsPage({ searchParams: Promise.resolve({}) }));
    const card = screen.getByRole('link', { name: 'Edit' }).closest('article')!;
    expect(card.textContent).toContain('$15.00');
    expect(card.textContent).toContain('Oct 16, 2026');
    expect(card.textContent).not.toContain('Aug 4');
    expect(within(card).getByRole('link', { name: 'Attendees' }).getAttribute('href')).toBe('/admin/schedule/rachel-oct16/roster');
    expect(db.classOccurrence.findFirst.mock.calls[0][0].where).toMatchObject({ template: { slug: template.slug, isEvent: false }, status: 'SCHEDULED', startAt: { gte: new Date() } });
  });
  it('links scheduled event editing to the existing template and date, and does not label class-ticket revenue as missing', async () => {
    render(await AdminEventsPage({ searchParams: Promise.resolve({}) }));
    const manage = screen.getByRole('link', { name: 'Manage' });
    const row = manage.closest('article')!;
    expect(manage.getAttribute('href')).toBe('/admin/schedule/rachel-oct16');
    expect(within(row).getByRole('link', { name: 'Edit photo & description' }).getAttribute('href')).toBe('/admin/classes/rachel');
    expect(within(row).getByRole('link', { name: 'Financial entries' }).getAttribute('href')).toBe('/admin/payments?occurrence=rachel-oct16');
    expect(row.textContent).toContain('Paid tickets are listed in Sales under class purchases.');
    expect(row.textContent).not.toContain('no matched payment records');
  });
});

it('puts event management before the financial report so Rachel is visible without scrolling through receipts', async () => {
  const { container } = render(await AdminEventsPage({ searchParams: Promise.resolve({}) }));
  const scheduled = screen.getByRole('heading', { name: /ALL EVENTS/ });
  const financial = screen.getByRole('region', { name: 'Financial report' });
  expect(scheduled.compareDocumentPosition(financial) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.textContent).toContain('Edit photo & description');
});
