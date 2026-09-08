import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  ERIKA_GIFTED_VIP,
  giftedVipAccessNote,
  isErikaGiftedVip,
} from '@/lib/domain/memberships/gifted-vip';

describe('Erika gifted VIP exception', () => {
  it('is private, unlimited, and ends February 1, 2027', () => {
    expect(ERIKA_GIFTED_VIP.email).toBe('erikamun78@gmail.com');
    expect(ERIKA_GIFTED_VIP.planName).toBe('UNLIMITED CREDITS VIP');
    expect(ERIKA_GIFTED_VIP.productSlug).toBe('erika-rivera-gifted-vip');
    expect(ERIKA_GIFTED_VIP.validUntil.toISOString()).toBe(
      '2027-02-02T04:59:59.999Z',
    );
    expect(ERIKA_GIFTED_VIP.isUnlimited).toBe(true);
    expect(ERIKA_GIFTED_VIP.isPublic).toBe(false);
  });

  it('recognizes only Erika’s private plan and supplies the profile note', () => {
    expect(isErikaGiftedVip('erika-rivera-gifted-vip')).toBe(true);
    expect(isErikaGiftedVip('the-vip-access-pass')).toBe(false);
    expect(giftedVipAccessNote('erika-rivera-gifted-vip')).toBe(
      'Gifted VIP access · Unlimited standard classes through February 1, 2027.',
    );
    expect(giftedVipAccessNote('the-vip-access-pass')).toBeNull();
  });

  it('removes only Erika’s obsolete manual grant while preserving gifted VIP access', () => {
    const migration = readFileSync(
      'netlify/database/migrations/20260811170000_remove_erika_manual_credit.sql',
      'utf8',
    );

    expect(migration).toContain("'erikamun78@gmail.com'");
    expect(migration).toContain("'cmsouq01o0086lc090yfax13o'");
    expect(migration).toContain(
      "'Class credit — Manual admin grant — expires 2026-08-17'",
    );
    expect(migration).toContain(
      `"id" <> 'rhyze-erika-gifted-vip-credit-2026'`,
    );
    expect(migration).toContain('DELETE FROM "CreditLedgerEntry"');
    expect(migration).toContain('DELETE FROM "CreditAccount"');
  });
});
