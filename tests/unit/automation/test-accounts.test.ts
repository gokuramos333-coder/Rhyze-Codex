import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_TEST_ACCOUNTS,
  hasAutomationAccountBusinessActivity,
} from '@/lib/automation/test-accounts';

describe('automation test account isolation', () => {
  it('defines one isolated account for every portal role', () => {
    expect(AUTOMATION_TEST_ACCOUNTS.map((account) => account.role)).toEqual([
      'OWNER',
      'INSTRUCTOR',
      'MEMBER',
    ]);
  });

  it('keeps every account out of customer reporting and public profiles', () => {
    for (const account of AUTOMATION_TEST_ACCOUNTS) {
      expect(account.email.endsWith('@rhyze.local')).toBe(true);
      expect(account.keychainService.startsWith('com.rhyze-fitness.automation.')).toBe(true);
    }

    expect(AUTOMATION_TEST_ACCOUNTS.find((account) => account.role === 'INSTRUCTOR'))
      .toMatchObject({ publicInstructorProfile: false });
    expect(AUTOMATION_TEST_ACCOUNTS.find((account) => account.role === 'OWNER'))
      .toMatchObject({ expectedPath: '/admin/instructors' });
  });

  it('uses unique identities and Keychain services', () => {
    expect(new Set(AUTOMATION_TEST_ACCOUNTS.map((account) => account.email)).size).toBe(3);
    expect(new Set(AUTOMATION_TEST_ACCOUNTS.map((account) => account.keychainService)).size).toBe(3);
  });

  it('rejects reuse of identities linked to business activity', () => {
    const clean = {
      stripeCustomerId: null,
      _count: {
        bookings: 0,
        purchases: 0,
        memberships: 0,
        attendanceRecords: 0,
        paymentRecords: 0,
        commerceOrders: 0,
        creditAccounts: 0,
        waitlistEntries: 0,
        classOccurrences: 0,
        classSeries: 0,
        sombleTransactions: 0,
      },
    };

    expect(hasAutomationAccountBusinessActivity(clean)).toBe(false);
    expect(hasAutomationAccountBusinessActivity({
      ...clean,
      _count: { ...clean._count, purchases: 1 },
    })).toBe(true);
    expect(hasAutomationAccountBusinessActivity({
      ...clean,
      stripeCustomerId: 'cus_existing',
    })).toBe(true);
  });

  it('guards every user-owned business relationship before reusing an identity', () => {
    const setup = readFileSync('scripts/setup-automation-test-accounts.ts', 'utf8');
    for (const relation of [
      'attendanceMarked',
      'membershipChangeRequests',
      'membershipChangeReviews',
      'membershipFreezesCreated',
      'instructorReviews',
      'instructorCommissions',
      'inAppNotifications',
      'conversationMessages',
      'classMessagesAuthored',
    ]) {
      expect(setup).toContain(`${relation}: true`);
    }
  });

  it('uses only read-only admin routes for authorization checks', () => {
    const smoke = readFileSync('scripts/portal-auth-smoke.ts', 'utf8');
    expect(smoke).not.toContain("verifyDenied(page, '/admin')");
    expect(smoke).toContain("verifyDenied(page, '/admin/settings')");
  });
});
