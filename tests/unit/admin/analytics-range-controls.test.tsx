// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AnalyticsRangeControls } from '@/components/admin/AnalyticsRangeControls';

afterEach(cleanup);
it('offers yearly and custom dates while retaining event filters without duplicate IDs', () => {
  const controls = (
    <AnalyticsRangeControls
      basePath="/admin/events"
      active="year"
      frequencyLabels
      from="2026-08-01"
      to="2026-10-31"
      preservedParams={{
        kind: 'event',
        offering: 'hip hop',
        occurrence: 'event-1',
      }}
    />
  );
  const { container } = render(
    <>
      {controls}
      {controls}
    </>,
  );
  expect(screen.getAllByRole('link', { name: 'Yearly' })[0]).toHaveAttribute(
    'href',
    '/admin/events?kind=event&offering=hip+hop&occurrence=event-1&range=year',
  );
  expect(screen.getAllByLabelText('From')[0]).toHaveValue('2026-08-01');
  expect(screen.getAllByLabelText('To')[0]).toHaveValue('2026-10-31');
  const data = new FormData(
    screen.getAllByRole('button', { name: 'View dates' })[0].closest('form')!,
  );
  expect(Object.fromEntries(data)).toEqual({
    range: 'custom',
    kind: 'event',
    offering: 'hip hop',
    occurrence: 'event-1',
    from: '2026-08-01',
    to: '2026-10-31',
  });
  const ids = [...container.querySelectorAll('[id]')].map(
    (element) => element.id,
  );
  expect(new Set(ids).size).toBe(ids.length);
});

describe('analytics range controls', () => {
  it('preserves the earnings and sales view in links and custom forms', () => {
    render(
      <AnalyticsRangeControls
        basePath="/admin"
        active="month"
        preservedParams={{ analytics: 'earnings', panel: 'sales' }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Day' }).getAttribute('href')).toBe(
      '/admin?analytics=earnings&panel=sales&range=day#earnings',
    );
    expect(document.querySelector('input[name="analytics"]')?.getAttribute('value')).toBe('earnings');
    expect(document.querySelector('input[name="panel"]')?.getAttribute('value')).toBe('sales');
  });
});
