// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortalNavigation } from '@/components/app-shell/PortalNavigation';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/classes',
}));

describe('admin navigation', () => {
  const source = readFileSync('app/(studio)/admin/layout.tsx', 'utf8');
  const overview = readFileSync('app/(studio)/admin/page.tsx', 'utf8');

  afterEach(() => cleanup());
  beforeEach(() => vi.stubGlobal('React', React));

  it('keeps Classes and removes the duplicate Schedule destination', () => {
    expect(source).toContain("href: '/admin/classes'");
    expect(source).not.toContain(
      "{ href: '/admin/schedule', label: 'Schedule' }",
    );
    expect(overview).not.toContain('href="/admin/schedule"');
  });

  it('keeps Slideshow separate from the Classes submenu and before Integrations', () => {
    expect(source).not.toContain(
      "href: '/admin/classes#slideshow-photos',\n        label: 'Slideshow Photos'",
    );
    expect(source).toContain(
      "{ href: '/admin/slideshow', label: 'Slideshow' }",
    );
    expect(source.indexOf("label: 'Slideshow'")).toBeLessThan(
      source.indexOf("label: 'Integrations'"),
    );

    render(
      <PortalNavigation
        items={[
          {
            href: '/admin/classes',
            label: 'Classes',
            children: [
              {
                href: '/admin/classes#scheduled-classes',
                label: 'Scheduled Classes',
              },
              {
                href: '/admin/classes#create-a-class',
                label: 'Create a Class',
              },
              {
                href: '/admin/classes#edit-a-class',
                label: 'Edit a Class',
              },
            ],
          },
          {
            href: '/admin/slideshow',
            label: 'Slideshow',
          },
          {
            href: '/admin/integrations',
            label: 'Integrations',
          },
        ]}
      />,
    );

    expect(screen.getByText('Classes').closest('details')).toHaveAttribute(
      'open',
    );
    expect(screen.getByRole('link', { name: 'Slideshow' }))
      .toHaveAttribute('href', '/admin/slideshow');
    expect(screen.getByRole('link', { name: 'Slideshow' })).toHaveClass(
      'text-sm',
    );
    expect(screen.getByRole('link', { name: 'Scheduled Classes' })).toHaveAttribute(
      'href',
      '/admin/classes#scheduled-classes',
    );
    expect(screen.getByRole('link', { name: 'Create a Class' })).toHaveAttribute(
      'href',
      '/admin/classes#create-a-class',
    );
    expect(screen.getByRole('link', { name: 'Edit a Class' })).toHaveAttribute(
      'href',
      '/admin/classes#edit-a-class',
    );
  });
});
