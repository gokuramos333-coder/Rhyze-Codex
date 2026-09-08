// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    <a href={href}>{children}</a>,
}));

import { AnalyticsRangeControls } from '@/components/admin/AnalyticsRangeControls';

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
