import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('membership and message cleanup', () => {
  it('removes the redundant membership-open promos and portal explainer', () => {
    const homePricing = readFileSync('components/sections/PricingTeaser.tsx', 'utf8');
    const join = readFileSync('app/join/page.tsx', 'utf8');

    expect(homePricing).not.toContain('MEMBERSHIPS ARE OPEN');
    expect(join).not.toContain('MEMBERSHIPS ARE OPEN');
    expect(join).not.toContain('openingBillingNote');
    expect(join).not.toContain('These options are managed in the My Rhyze member portal');
  });

  it('keeps replies close to the other side of the conversation', () => {
    const member = readFileSync('app/(portal)/member/messages/page.tsx', 'utf8');
    const admin = readFileSync('app/(studio)/admin/messages/[conversationId]/page.tsx', 'utf8');

    expect(member).not.toContain("mine ? 'ml-auto");
    expect(admin).not.toContain("fromMember ? 'border-rhyze-coral bg-white' : 'ml-auto");
    expect(member).toContain("mine ? 'ml-8 md:ml-14");
    expect(admin).toContain("fromMember ? 'border-rhyze-coral bg-white' : 'ml-8 md:ml-14");
  });
});
