import { describe, expect, it } from 'vitest';
import { releaseTestEnvironment, redact } from '@/scripts/release/guards';
const local = {
  DISCOUNT_TEST_DATABASE_URL: 'postgresql://tester@127.0.0.1:51917/discount_campaign_test',
  DISCOUNT_TEST_DATA_DIRECTORY: '/tmp/owned-discount-pg',
  TRIAL_TEST_DATABASE_DIR: '/tmp/owned-trial-cluster',
  DATABASE_URL: 'postgresql://tester@127.0.0.1:51917/callback_test',
  CALLBACK_TEST_DATABASE_URL:
    'postgresql://tester@127.0.0.1:51917/callback_test',
  IDENTITY_TEST_DATABASE_URL:
    'postgresql://tester@127.0.0.1:51917/identity_migration',
  VIP_TEST_DATABASE_URL:
    'postgresql://tester@127.0.0.1:51917/identity_migration',
  PLAN_CHANGE_TEST_DATABASE_URL:
    'postgresql://tester@127.0.0.1:51917/membership_plan_test',
  NEWSLETTER_TEST_DATABASE_URL:
    'postgresql://tester@127.0.0.1:51917/rhyze_newsletter_preview',
  ADMIN_RENEWAL_TEST_DATABASE_URL: 'postgresql://tester@127.0.0.1:51917/admin_renewal_test',
  ADMIN_RENEWAL_TEST_DATABASE_DIR: '/tmp/new-owned-admin-cluster',
  KELLY_TEST_DATABASE_URL:
    'postgresql://tester:syntheticPassword@127.0.0.1:51917/kelly_renewal_actions_test',
  KELLY_TEST_DATABASE_DIR: '/tmp/new-owned-kelly-cluster',
};
describe('Admin supported release environment', () => {
  it('passes the explicit URL and owned directory through the real builder, not inherited secrets', () => {
    const env = releaseTestEnvironment({
      ...local,
      STRIPE_SECRET_KEY: 'synthetic-secret',
      NETLIFY_AUTH_TOKEN: 'synthetic-token',
      EMAIL_DELIVERY_ENABLED: 'true',
    });
    expect(env.ADMIN_RENEWAL_TEST_DATABASE_URL).toBe(local.ADMIN_RENEWAL_TEST_DATABASE_URL);
    expect(env.ADMIN_RENEWAL_TEST_DATABASE_DIR).toBe(local.ADMIN_RENEWAL_TEST_DATABASE_DIR);
    expect(env.NODE_ENV).toBe('test');
    expect(env.EMAIL_DELIVERY_ENABLED).toBe('false');
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.NETLIFY_AUTH_TOKEN).toBeUndefined();
    expect(redact(JSON.stringify(env))).not.toContain('syntheticPassword');
  });
  it.each(['ADMIN_RENEWAL_TEST_DATABASE_URL', 'ADMIN_RENEWAL_TEST_DATABASE_DIR'])(
    'requires %s without fallback',
    (key) => {
      expect(() =>
        releaseTestEnvironment({ ...local, [key]: undefined }),
      ).toThrow();
    },
  );
  it.each([
    {
      ADMIN_RENEWAL_TEST_DATABASE_URL:
        'postgresql://tester:syntheticPassword@remote.test:51917/admin_renewal_test',
    },
    {
      ADMIN_RENEWAL_TEST_DATABASE_URL: local.ADMIN_RENEWAL_TEST_DATABASE_URL.replace(
        'admin_renewal_test',
        'customers',
      ),
    },
    {
      ADMIN_RENEWAL_TEST_DATABASE_URL:
        local.ADMIN_RENEWAL_TEST_DATABASE_URL + '?host=remote.test',
    },
    { ADMIN_RENEWAL_TEST_DATABASE_DIR: 'relative-directory' },
  ])(
    'rejects unsafe declarations without reflecting credentials: %j',
    (override) => {
      expect(() => releaseTestEnvironment({ ...local, ...override })).toThrow();
      try {
        releaseTestEnvironment({ ...local, ...override });
      } catch (error) {
        expect(String(error)).not.toContain('syntheticPassword');
      }
    },
  );
});
