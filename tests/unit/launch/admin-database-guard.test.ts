import { expect, it } from 'vitest';
import {
  adminRenewalTestDatabase,
  assertAdminRenewalTestDatabaseIdentity,
} from '@/scripts/release/admin-test-database';
const env = {
  NODE_ENV: 'test',
  ADMIN_RENEWAL_TEST_DATABASE_URL:
    'postgresql://tester@127.0.0.1:51917/admin_renewal_test',
  ADMIN_RENEWAL_TEST_DATABASE_DIR: '/tmp/new-owned-kelly-cluster',
};
const identity = {
  name: 'admin_renewal_test',
  address: '127.0.0.1',
  port: 51917,
  directory: env.ADMIN_RENEWAL_TEST_DATABASE_DIR,
};
it('accepts a newly explicitly declared owned cluster only with matching server identity', () => {
  const config = adminRenewalTestDatabase(env);
  expect(config.url).toBe(env.ADMIN_RENEWAL_TEST_DATABASE_URL);
  expect(() =>
    assertAdminRenewalTestDatabaseIdentity(config, [identity]),
  ).not.toThrow();
});
it.each([
  { address: '192.0.2.1' },
  { name: 'customers' },
  { port: 51918 },
  { directory: '/tmp/another-workers-cluster' },
  { directory: '' },
])('rejects a mismatched server identity: %j', (override) => {
  expect(() =>
    assertAdminRenewalTestDatabaseIdentity(adminRenewalTestDatabase(env), [
      { ...identity, ...override },
    ]),
  ).toThrow(/identity/);
});
it('rejects missing or ambiguous identity', () => {
  for (const rows of [[], [identity, identity]])
    expect(() =>
      assertAdminRenewalTestDatabaseIdentity(adminRenewalTestDatabase(env), rows),
    ).toThrow();
});
it.each([
  { NODE_ENV: 'production' },
  { NODE_ENV: undefined },
  { ADMIN_RENEWAL_TEST_DATABASE_DIR: undefined },
  { ADMIN_RENEWAL_TEST_DATABASE_DIR: '/' },
  { ADMIN_RENEWAL_TEST_DATABASE_DIR: '/tmp/../someone-else' },
  { ADMIN_RENEWAL_TEST_DATABASE_URL: undefined },
  {
    ADMIN_RENEWAL_TEST_DATABASE_URL: env.ADMIN_RENEWAL_TEST_DATABASE_URL.replace(
      '127.0.0.1',
      'localhost',
    ),
  },
  {
    ADMIN_RENEWAL_TEST_DATABASE_URL: env.ADMIN_RENEWAL_TEST_DATABASE_URL.replace(':51917', ''),
  },
  {
    ADMIN_RENEWAL_TEST_DATABASE_URL: env.ADMIN_RENEWAL_TEST_DATABASE_URL + '?host=remote.test',
  },
  { ADMIN_RENEWAL_TEST_DATABASE_URL: env.ADMIN_RENEWAL_TEST_DATABASE_URL + '#override' },
])('fails closed for unsafe or incomplete configuration: %j', (override) => {
  expect(() => adminRenewalTestDatabase({ ...env, ...override })).toThrow();
});
