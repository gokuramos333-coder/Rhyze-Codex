// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  classTemplate: { findFirst: vi.fn() },
  classOccurrence: { findFirst: vi.fn() },
  product: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  creditAccount: { findMany: vi.fn() },
  auth: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: db }));
vi.mock('@/auth', () => ({ auth: db.auth }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('not-found'); },
}));

import BookingPage from '@/app/book/[slug]/page';
import { getClass } from '@/lib/classes';

const template = {
  id: 'synthetic-template', slug: 'rhyzology-generated123', name: 'Rhyzology',
  description: 'Owner-created movement practice. Explore your rhythm.',
  durationMinutes: 50, category: { slug: 'custom-category', name: 'Movement Lab' },
  tags: ['Guided movement'], equipment: ['Comfortable clothes'],
  isActive: true, archivedAt: null, isEvent: false, imageUrl: null,
};
const occurrence = {
  id: 'synthetic-date', template, startAt: new Date('2099-11-05T18:00:00Z'),
  endAt: new Date('2099-11-05T18:50:00Z'), capacity: 25, priceCents: 2500,
  historicalSignupCount: 0, instructor: { name: 'Test Instructor' },
  series: null, _count: { bookings: 0, waitlistEntries: 0 },
};
function serveTemplate(row: typeof template | null) {
  // Simulate the Prisma where boundary, so exclusion tests exercise page queries.
  db.classTemplate.findFirst.mockImplementation(async ({ where }) => {
    if (!row) return null;
    return Object.entries(where).every(([key, value]) => row[key as keyof typeof row] === value)
      ? row : null;
  });
}
const page = (slug = template.slug, occurrenceId?: string) => BookingPage({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve(occurrenceId ? { occurrence: occurrenceId } : {}),
});

beforeEach(() => {
  serveTemplate(template);
  db.auth.mockResolvedValue(null);
  db.classOccurrence.findFirst.mockResolvedValue(occurrence);
  db.product.findMany.mockResolvedValue([{ id: 'drop-in', kind: 'DROP_IN', priceCents: 2500 }]);
  db.user.findUnique.mockResolvedValue({ status: 'ACTIVE', memberships: [] });
  db.creditAccount.findMany.mockResolvedValue([]);
});
afterEach(cleanup);

describe('database-created STANDARD class booking page', () => {
  it.each([
    [template.slug, 'Movement Lab'],
    ['global-hiit-mackenzie', 'Strength & HIIT'],
  ])('renders one category label and three working purchase paths for %s', async (slug, category) => {
    db.product.findMany.mockResolvedValue([
      { id: 'drop-in', kind: 'DROP_IN', priceCents: 2500 },
      { id: 'intro', kind: 'INTRO_TRIAL', priceCents: 700 },
    ]);
    render(await page(slug, occurrence.id));
    // Count visible text, not an implementation-specific variable or JSX expression.
    expect(document.body.textContent?.split(category)).toHaveLength(2);
    const returnPath = `/book/${slug}?occurrence=${occurrence.id}`;
    expect(screen.getByRole('link', { name: /Use Membership Credit/ }).getAttribute('href'))
      .toBe(`/sign-in?callbackUrl=${encodeURIComponent(`/member/bookings/new?occurrence=${occurrence.id}`)}`);
    expect(screen.getByRole('link', { name: /Intro Offer 7-Days/ }).getAttribute('href'))
      .toBe(`/sign-in?callbackUrl=${encodeURIComponent(`/member/membership?selected=intro&returnTo=${encodeURIComponent(returnPath)}`)}`);
    expect(screen.getByRole('link', { name: /Single Class/ }).getAttribute('href'))
      .toBe(`/sign-in?callbackUrl=${encodeURIComponent(`/member/membership?selected=drop-in&returnTo=${encodeURIComponent(returnPath)}`)}`);
  });

  it.each([
    'rhyzology-reggaeton-choreo-step-by-step-mvv89s0x',
    'rhyzology-reggaeton-choreo-step-by-step-mvv8dqhk',
  ])('resolves the live-generated slug %s without a catalog entry', async (slug) => {
    // Public schedule identifiers; all database rows and occurrence IDs remain synthetic.
    const row = { ...template, slug, name: 'Rhyzology : Reggaeton choreo (step by step)' };
    serveTemplate(row);
    db.classOccurrence.findFirst.mockResolvedValue({ ...occurrence, template: row });
    expect(getClass(slug)).toBeUndefined();
    render(await page(slug, occurrence.id));
    expect(screen.getByRole('heading', { name: row.name.toUpperCase() })).toBeTruthy();
    expect(db.classTemplate.findFirst).toHaveBeenCalledWith({
      where: { slug, isActive: true, archivedAt: null, isEvent: false },
      include: { category: true },
    });
    expect(screen.getByRole('link', { name: /Explore Membership Options/ }).getAttribute('href'))
      .toBe(`/memberships?returnTo=${encodeURIComponent(`/book/${slug}?occurrence=${occurrence.id}`)}`);
  });

  it('renders database content and links anonymous visitors to the selected occurrence', async () => {
    expect(getClass(template.slug)).toBeUndefined();
    render(await page(template.slug, occurrence.id));
    expect(screen.getByRole('heading', { name: 'RHYZOLOGY' })).toBeTruthy();
    expect(screen.getByText(template.description)).toBeTruthy();
    expect(document.body.textContent).toContain('Movement Lab');
    expect(document.body.textContent).toContain('50 min');
    expect(screen.getByText('Guided movement')).toBeTruthy();
    expect(screen.getByText('Comfortable clothes')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Use Membership Credit/ }).getAttribute('href'))
      .toBe(`/sign-in?callbackUrl=${encodeURIComponent(`/member/bookings/new?occurrence=${occurrence.id}`)}`);
    expect(db.classOccurrence.findFirst.mock.calls[0][0].where)
      .toMatchObject({ template: { slug: template.slug }, id: occurrence.id, status: 'SCHEDULED' });
  });

  it('sends an eligible signed-in member to the real occurrence booking route', async () => {
    db.auth.mockResolvedValue({ user: { id: 'synthetic-member' } });
    db.creditAccount.findMany.mockResolvedValue([{ label: 'Class credits', isUnlimited: false, entries: [{ quantity: 1 }] }]);
    render(await page());
    expect(screen.getByRole('link', { name: /Use Membership Credit/ }).getAttribute('href'))
      .toBe(`/member/bookings/new?occurrence=${occurrence.id}`);
  });

  it('uses database duration without dates and does not invent schedule inventory', async () => {
    db.classOccurrence.findFirst.mockResolvedValue(null);
    serveTemplate({ ...template, durationMinutes: 65 });
    render(await page());
    expect(document.body.textContent).toContain('65 min');
    expect(document.body.textContent).toContain('Upcoming dates will');
    expect(screen.getByRole('link', { name: /Use Membership Credit/ }).getAttribute('href'))
      .not.toContain('/member/bookings/new');
  });

  it('preserves occurrence duration overrides', async () => {
    db.classOccurrence.findFirst.mockResolvedValue({ ...occurrence, endAt: new Date('2099-11-05T19:15:00Z') });
    render(await page());
    expect(document.body.textContent).toContain('75 min');
    expect(document.body.textContent).not.toContain('50 min');
  });

  it.each([
    ['unknown', null],
    ['inactive', { ...template, isActive: false }],
    ['archived', { ...template, archivedAt: new Date('2026-01-01') }],
    ['event', { ...template, isEvent: true }],
  ])('rejects %s templates before rendering booking choices', async (_label, row) => {
    serveTemplate(row as typeof template | null);
    await expect(page()).rejects.toThrow('not-found');
    expect(db.classOccurrence.findFirst).not.toHaveBeenCalled();
    expect(db.auth).not.toHaveBeenCalled();
  });

  it('preserves known static editorial copy instead of replacing it with database copy', async () => {
    const known = getClass('global-hiit-mackenzie')!;
    db.classOccurrence.findFirst.mockResolvedValue({ ...occurrence, template: { ...template, slug: known.slug } });
    render(await page(known.slug));
    expect(screen.getByText(known.description)).toBeTruthy();
    expect(screen.getByText(known.tagline)).toBeTruthy();
    expect(document.body.textContent).not.toContain(template.description);
    expect(document.body.textContent).toContain('Strength & HIIT');
  });
});
