import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  classTemplate: { findFirst: vi.fn(), findMany: vi.fn() },
  classOccurrence: { findFirst: vi.fn() },
  product: { findMany: vi.fn() },
  user: { findUnique: vi.fn() }, creditAccount: { findMany: vi.fn() }, auth: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: db }));
vi.mock('@/auth', () => ({ auth: db.auth }));
import EventDetailPage from '@/app/events/[slug]/page';
import BookingPage from '@/app/book/[slug]/page';
import { EventsPreview } from '@/components/sections/EventsPreview';

function propsIn(node: React.ReactNode): any[] {
  if (Array.isArray(node)) return node.flatMap(propsIn);
  if (!React.isValidElement(node)) return [];
  const props = node.props as { children?: React.ReactNode };
  return [props, ...propsIn(props.children)];
}
function textIn(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textIn).join(' ');
  if (React.isValidElement(node)) return textIn((node.props as { children?: React.ReactNode }).children);
  return '';
}
const slug = 'soul-line-dancing-rachel';
const template = { slug, name: 'Soul Line Dancing with Rachel', description: 'Connection, rhythm, and joy.', durationMinutes: 60, isEvent: false, dropInPriceCents: 2500 };
const occurrence = { id: 'rachel-oct16', template, priceCents: 1500, startAt: new Date('2026-10-16T23:30Z'), capacity: 25, historicalSignupCount: 0, instructor: { name: 'Rachel Crowe' }, _count: { bookings: 0, waitlistEntries: 0 } };
beforeEach(() => {
  vi.stubGlobal('React', React);
  db.auth.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue({ status: 'ACTIVE', memberships: [{ status: 'ACTIVE', product: { kind: 'LIMITED_MEMBERSHIP' }, currentPeriodEnd: new Date('2099-01-01') }] });
  db.creditAccount.findMany.mockResolvedValue([]);
  db.classTemplate.findFirst.mockResolvedValue({ ...template, occurrences: [occurrence] });
  db.classTemplate.findMany.mockResolvedValue([{ ...template, occurrences: [occurrence] }]);
  db.classOccurrence.findFirst.mockResolvedValue(occurrence);
  db.product.findMany.mockResolvedValue([{ id: 'drop-in', kind: 'DROP_IN', priceCents: 2500 }]);
});
afterEach(() => vi.unstubAllGlobals());
describe('Rachel public event to class-credit booking flow', () => {
  it('shows the actual $15 occurrence and retains its identity in the standard-credit booking link', async () => {
    const page = await EventDetailPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ occurrence: occurrence.id }) });
    const props = propsIn(page);
    expect(props.some(p => p.label === 'Price' && p.value === '$15.00')).toBe(true);
    expect(props.some(p => p.href === `/book/${slug}?occurrence=${occurrence.id}`)).toBe(true);
    expect(textIn(page)).toContain('VIP unlimited access does not use your monthly event credit');
    expect(renderToStaticMarkup(page)).toMatch(/>Event<\/span>/);
    expect(db.classTemplate.findFirst.mock.calls[0][0].where).toMatchObject({ slug, isActive: true, archivedAt: null, OR: [{ isEvent: true }, { isEvent: false, slug }] });
  });
  it('displays $15 on the Events list instead of the old $25 template price', async () => {
    const page = await EventsPreview({});
    expect(textIn(page)).toContain('$ 15');
    expect(textIn(page)).toContain('Class credits & VIP unlimited welcome');
    expect(propsIn(page).some(p => p.href === `/events/${slug}?occurrence=${occurrence.id}`)).toBe(true);
  });
  it('offers member credits and an occurrence-bound $15 ticket, with the live 60-minute duration', async () => {
    const page = await BookingPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ occurrence: occurrence.id }) });
    const text = textIn(page);
    expect(text).toContain('Event Booking');
    expect(renderToStaticMarkup(page)).toMatch(/>Event<\/span>/);
    expect(text).toMatch(/60\s+min/);
    expect(text).toContain('Use Membership Credit');
    expect(text).not.toContain('Weekly recurring class');
    expect(text).not.toContain('Intro Offer 7-Days');
    expect(propsIn(page).some(p => typeof p.href === 'string' && decodeURIComponent(p.href).includes(`/member/class-checkout?occurrence=${occurrence.id}`))).toBe(true);
  });
  it('keeps the $15 choice available to a logged-in member too', async () => {
    db.auth.mockResolvedValue({ user: { id: 'synthetic-member' } });
    const page = await BookingPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ occurrence: occurrence.id }) });
    expect(textIn(page)).toContain('Pay for this event');
    expect(propsIn(page).some(p => p.href === `/member/class-checkout?occurrence=${occurrence.id}`)).toBe(true);
  });
});
