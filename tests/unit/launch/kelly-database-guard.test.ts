import { expect, it } from 'vitest';
import {
  kellyTestDatabase,
  assertKellyTestDatabaseIdentity,
} from '@/scripts/release/kelly-test-database';
const env = {
  NODE_ENV: 'test',
  KELLY_TEST_DATABASE_URL:
    'postgresql://tester@127.0.0.1:51917/kelly_renewal_actions_test',
  KELLY_TEST_DATABASE_DIR: '/tmp/new-owned-kelly-cluster',
};
const identity = {
  name: 'kelly_renewal_actions_test',
  address: '127.0.0.1',
  port: 51917,
  directory: env.KELLY_TEST_DATABASE_DIR,
};
it('accepts a newly explicitly declared owned cluster only with matching server identity', () => {
  const config = kellyTestDatabase(env);
  expect(config.url).toBe(env.KELLY_TEST_DATABASE_URL);
  expect(() =>
    assertKellyTestDatabaseIdentity(config, [identity]),
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
    assertKellyTestDatabaseIdentity(kellyTestDatabase(env), [
      { ...identity, ...override },
    ]),
  ).toThrow(/identity/);
});
it('rejects missing or ambiguous identity', () => {
  for (const rows of [[], [identity, identity]])
    expect(() =>
      assertKellyTestDatabaseIdentity(kellyTestDatabase(env), rows),
    ).toThrow();
});
it.each([
  { NODE_ENV: 'production' },
  { NODE_ENV: undefined },
  { KELLY_TEST_DATABASE_DIR: undefined },
  { KELLY_TEST_DATABASE_DIR: '/' },
  { KELLY_TEST_DATABASE_DIR: '/tmp/../someone-else' },
  { KELLY_TEST_DATABASE_URL: undefined },
  {
    KELLY_TEST_DATABASE_URL: env.KELLY_TEST_DATABASE_URL.replace(
      '127.0.0.1',
      'localhost',
    ),
  },
  {
    KELLY_TEST_DATABASE_URL: env.KELLY_TEST_DATABASE_URL.replace(':51917', ''),
  },
  {
    KELLY_TEST_DATABASE_URL: env.KELLY_TEST_DATABASE_URL + '?host=remote.test',
  },
  { KELLY_TEST_DATABASE_URL: env.KELLY_TEST_DATABASE_URL + '#override' },
])('fails closed for unsafe or incomplete configuration: %j', (override) => {
  expect(() => kellyTestDatabase({ ...env, ...override })).toThrow();
});
