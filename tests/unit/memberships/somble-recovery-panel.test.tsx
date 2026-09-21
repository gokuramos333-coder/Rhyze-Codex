import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SombleRecoveryPanel } from '@/components/memberships/SombleRecoveryPanel';
import { recoveryForUser } from '@/lib/domain/memberships/somble-billing-recovery';
describe('member recovery consent', () => {
  it('shows exact dates and price with explicit required recurring consent and expired-checkout retry', () => {
    const html = renderToStaticMarkup(
      <SombleRecoveryPanel
        recovery={recoveryForUser('cmryg3hyo000zw9wrhuigtu3y')!}
        action={async () => {}}
      />,
    );
    expect(html).toContain('September 3–October 3, 2026');
    expect(html).toContain('$92');
    expect(html).toContain('3rd');
    expect(html).toContain('eight standard classes');
    expect(html).toContain('name="recurringConsent"');
    expect(html).toContain('required=""');
    expect(html).toContain('name="membershipId"');
    expect(html).toContain('name="retryExpired"');
    expect(html).not.toContain('name="card');
  });
});
