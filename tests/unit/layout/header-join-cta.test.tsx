// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('desktop header Join Now CTA', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.stubGlobal('React', React);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ user: null }) }),
    );
  });

  it('keeps the complete label on one line when header space is tight', () => {
    render(<Header />);

    expect(screen.getByRole('link', { name: 'Join Now' })).toHaveClass(
      'whitespace-nowrap',
      'shrink-0',
    );
  });

  it('labels the signed-out account action Log In and styles it like the primary CTA', () => {
    render(<Header />);

    const loginLinks = screen.getAllByRole('link', { name: 'Log In' });
    expect(loginLinks.length).toBeGreaterThan(0);
    expect(loginLinks[0]).toHaveClass(
      'rhyze-gradient',
      'text-rhyze-black',
      'whitespace-nowrap',
      'shrink-0',
      'text-xs',
      'px-4',
      'py-2',
    );
  });

  it('keeps the mission image above its copy and the Come As You Are image below its copy on mobile', () => {
    const source = readFileSync('app/about/page.tsx', 'utf8');

    expect(source).toContain('order-2 lg:order-1');
    expect(source).toContain('order-1 relative aspect-[4/5]');
    expect(source).toContain('order-2 relative aspect-[3/2]');
    expect(source).toContain('order-1 lg:order-1');
  });

  it('keeps mobile account actions inside a scrollable menu', () => {
    const source = readFileSync(
      'components/layout/MobileNav.tsx',
      'utf8',
    );

    expect(source).toContain('overflow-y-auto');
    expect(source).toContain('className="mt-3 w-full"');
    expect(source).toContain('href="/join" size="lg" onClick={onClose}');
    expect(source).toContain('Join Now');
    expect(source).toContain('portalLabel');
  });

  it('closes the mobile drawer when Join Now is tapped so the /join link can navigate', () => {
    const onClose = vi.fn();
    render(<MobileNav open onClose={onClose} />);

    const join = screen.getByRole('link', { name: 'Join Now' });
    expect(join).toHaveAttribute('href', '/join');

    fireEvent.click(join);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses the visible orange R browser icon mark', () => {
    const icon = readFileSync('app/icon.tsx', 'utf8');
    const appleIcon = readFileSync('app/apple-icon.tsx', 'utf8');

    expect(icon).toContain('linear-gradient(135deg,#F05A3C,#F7931E 55%,#FFC72C)');
    expect(appleIcon).toContain('linear-gradient(135deg,#F05A3C,#F7931E 55%,#FFC72C)');
    expect(icon).toContain('>\n        R\n');
    expect(appleIcon).toContain('>\n          R\n');
  });
});
