import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('public membership surfaces', () => {
  it('keeps the single-class drop-in on booking pages only', () => {
    const pricingSource = readFileSync(
      'components/sections/PricingCards.tsx',
      'utf8',
    );
    const membershipsSource = readFileSync('app/memberships/page.tsx', 'utf8');
    const bookingSource = readFileSync('app/book/[slug]/page.tsx', 'utf8');

    expect(pricingSource).toContain("kind: { not: 'DROP_IN' }");
    expect(membershipsSource).toContain("kind: { not: 'DROP_IN' }");
    expect(bookingSource).toContain("'DROP_IN'");
    expect(bookingSource).toContain('Single Class');
  });

  it('sends signed-in members to their selected plan instead of account creation', () => {
    const pricingSource = readFileSync(
      'components/sections/PricingCards.tsx',
      'utf8',
    );

    expect(pricingSource).toContain("import { auth } from '@/auth'");
    expect(pricingSource).toContain('/member/membership?plan=');
    expect(pricingSource).toContain('callbackUrl=');
  });

  it('provides a private OG Rhyze Tribe destination without listing it publicly', () => {
    expect(
      existsSync('app/memberships/private/og-rhyze-tribe-2026/page.tsx'),
    ).toBe(true);
    const privatePage = readFileSync(
      'app/memberships/private/og-rhyze-tribe-2026/page.tsx',
      'utf8',
    );
    const publicPricing = readFileSync(
      'components/sections/PricingCards.tsx',
      'utf8',
    );

    expect(privatePage).toContain('OG Rhyze Tribe');
    expect(privatePage).toContain('8 standard class credits per month');
    expect(privatePage).toContain('$92');
    expect(publicPricing).toContain('isPublic: true');
  });
});
