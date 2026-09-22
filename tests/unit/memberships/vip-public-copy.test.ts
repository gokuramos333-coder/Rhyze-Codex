import { describe, expect, it } from 'vitest';
import { publicMembershipDescription, membershipDisplayDetails } from '@/lib/catalog/membership-copy';

describe('public VIP copy', () => {
  const description = 'Founding members lock in $199/month for life\nUnlimited standard classes\n1 eligible specialty event per month';
  it('removes only the withdrawn price promise', () => {
    expect(publicMembershipDescription(description)).toBe('Unlimited standard classes\n1 eligible specialty event per month');
    expect(publicMembershipDescription('VIP $222 monthly.')).toBe('VIP $222 monthly.');
  });
  it('also removes the promise from bullet details', () => {
    expect(membershipDisplayDetails({ description, isUnlimited: true, includedCredits: null, cancellationPolicy: null })).not.toContain('Founding members lock in $199/month for life');
  });
});
