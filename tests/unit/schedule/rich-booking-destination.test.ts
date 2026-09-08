import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('schedule booking destinations', () => {
  it('opens rich class and event detail flows from calendar cards', () => {
    const querySource = readFileSync(
      'lib/domain/schedule/public-schedule-query.ts',
      'utf8',
    );
    const routeSource = readFileSync(
      'lib/domain/schedule/public-calendar.ts',
      'utf8',
    );

    expect(querySource).toContain('publicScheduleDetailHref');
    expect(routeSource).toContain('`/events/${templateSlug}`');
    expect(routeSource).toContain(
      '`/book/${templateSlug}?occurrence=${occurrenceId}`',
    );
  });

  it('keeps the selected occurrence throughout the rich class booking flow', () => {
    const source = readFileSync('app/book/[slug]/page.tsx', 'utf8');

    expect(source).toContain('searchParams');
    expect(source).toContain('searchParams.occurrence');
    expect(source).toContain('id: searchParams.occurrence');
    expect(source).toContain('?occurrence=${occurrence.id}');
  });

  it('offers three clickable purchase paths without repeating the class category', () => {
    const source = readFileSync('app/book/[slug]/page.tsx', 'utf8');

    expect(source).toContain('Use Membership Credit');
    expect(source).toContain('Intro Offer 7-Days');
    expect(source).toContain('Single Class');
    expect(source).toContain('singleClassPrice');
    expect(source).toContain('<Link');
    expect(source).not.toContain('ownedMemberships.slice');
    expect(source).not.toContain('lg:mt-64');
    expect(source.match(/categoryLabel\[cls\.category\]/g)).toHaveLength(1);
  });

  it('sends people without an active membership to membership selection', () => {
    const source = readFileSync('app/book/[slug]/page.tsx', 'utf8');

    expect(source).toContain("status: { in: ['TRIALING', 'ACTIVE'] }");
    expect(source).toContain('activeMembership');
    expect(source).toContain('`/memberships?returnTo=${encodeURIComponent(returnPath)}`');
  });

  it('uses one membership exploration button instead of listing every plan', () => {
    const source = readFileSync('app/book/[slug]/page.tsx', 'utf8');

    expect(source).toContain('Save With A Membership');
    expect(source).toContain('Explore Membership Options');
    expect(source).toContain('href={`/memberships?returnTo=${encodeURIComponent(returnPath)}`}');
    expect(source).not.toContain('monthlyProducts.map');
    expect(source.indexOf('Single Class')).toBeLessThan(
      source.indexOf('Save With A Membership'),
    );
  });

  it('always shows the membership-credit path so guests can sign in', () => {
    const source = readFileSync('app/book/[slug]/page.tsx', 'utf8');

    expect(source).toContain('Use Membership Credit');
    expect(source).not.toContain('(hasMembershipAccess || !session?.user) &&');
    expect(source).toContain('Sign in to check your membership and credits.');
  });

  it('keeps waiver prompts off the class detail after mandatory signup acceptance', () => {
    const source = readFileSync('app/book/[slug]/page.tsx', 'utf8');

    expect(source).not.toContain('waiverHref');
    expect(source).not.toContain('Waiver status');
    expect(source).toContain('Use Membership Credit');
  });

  it('places instructor identity under the class title and labels recurring classes', () => {
    const source = readFileSync('app/book/[slug]/page.tsx', 'utf8');
    const titleIndex = source.indexOf('{bookingTitle.toUpperCase()}');
    const instructorIndex = source.indexOf('Instructor', titleIndex);
    const taglineIndex = source.indexOf('{cls.tagline}', titleIndex);

    expect(titleIndex).toBeGreaterThan(-1);
    expect(instructorIndex).toBeGreaterThan(titleIndex);
    expect(instructorIndex).toBeLessThan(taglineIndex);
    expect(source).toContain('series: { select: { recurrenceRule: true } }');
    expect(source).toContain(
      'const isWeekly = Boolean(occurrence?.series || matchingSlot)',
    );
    expect(source).toContain('Weekly recurring class');
  });

  it('continues from an event detail page into its event booking flow', () => {
    const source = readFileSync('app/events/[slug]/page.tsx', 'utf8');

    expect(source).toContain('`/book/event/${event.slug}`');
    expect(source).not.toContain(
      'occurrence ? `/schedule/${occurrence.id}` : \'/schedule\'',
    );
  });
});
