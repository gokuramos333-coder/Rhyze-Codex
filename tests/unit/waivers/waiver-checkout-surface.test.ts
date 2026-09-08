import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('waiver gating for paid access', () => {
  const membershipActions = readFileSync(
    'app/(portal)/member/membership/actions.ts',
    'utf8',
  );
  const eventCheckoutRoute = readFileSync(
    'app/api/checkout/event/route.ts',
    'utf8',
  );
  const signUpForm = readFileSync(
    'components/domain/accounts/SignUpForm.tsx',
    'utf8',
  );

  it('requires an active waiver acceptance before starting membership or class-pack checkout', () => {
    expect(membershipActions).toContain('membershipWaiverDestination');
    expect(membershipActions).toContain('waiverVersionId_userId');
    expect(membershipActions).toContain("redirect(membershipWaiverDestination())");
    expect(membershipActions.indexOf('waiverVersionId_userId')).toBeLessThan(
      membershipActions.indexOf('const purchase = await prisma.purchase.create'),
    );
  });

  it('requires waiver acceptance before event checkout creates a paid order', () => {
    expect(eventCheckoutRoute).toContain('eventCheckoutWaiverDestination');
    expect(eventCheckoutRoute).toContain('waiverUrl');
    expect(eventCheckoutRoute).toContain('waiverVersionId_userId');
    expect(eventCheckoutRoute.indexOf('waiverVersionId_userId')).toBeLessThan(
      eventCheckoutRoute.indexOf('const order = await prisma.commerceOrder.create'),
    );
  });

  it('shows the cancellation policy beside the account-creation waiver checkbox', () => {
    expect(signUpForm).toContain('Cancellation policy');
    expect(signUpForm).toContain('6 hours before class');
    expect(signUpForm).toContain('Within 2 hours');
    expect(signUpForm).toContain('No-shows are charged');
    expect(signUpForm).toContain('VIP transfers are free');
  });
});
