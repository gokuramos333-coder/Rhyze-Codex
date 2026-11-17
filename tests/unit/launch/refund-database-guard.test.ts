import { expect, it } from 'vitest';
import { refundTestDatabase } from '@/scripts/release/refund-test-database';
const env = {
  NODE_ENV: 'test',
  REFUND_TEST_DATABASE_URL:
    'postgresql://refund_test@localhost:55473/refund_review_test?host=%2Fprivate%2Ftmp%2Fowned-refund',
  REFUND_TEST_DATABASE_DIR: '/private/tmp/owned-refund/data',
  REFUND_TEST_SOCKET_DIR: '/private/tmp/owned-refund',
};
it('requires exact declared server identity before fixture writes', () => {
  const config = refundTestDatabase(env);
  expect(() => config.assertIdentity([config.identity])).not.toThrow();
  for (const patch of [
    { dir: '/other/data' },
    { port: 5432 },
    { db: 'customers' },
    { addr: '127.0.0.1' },
    { user: 'postgres' },
  ])
    expect(() =>
      config.assertIdentity([{ ...config.identity, ...patch }]),
    ).toThrow('identity mismatch');
  expect(() => config.assertIdentity([])).toThrow();
});
it.each([
  { NODE_ENV: 'production' },
  { REFUND_TEST_DATABASE_URL: undefined },
  { REFUND_TEST_DATABASE_DIR: undefined },
  { REFUND_TEST_SOCKET_DIR: undefined },
  {
    REFUND_TEST_DATABASE_URL: env.REFUND_TEST_DATABASE_URL.replace(
      'localhost',
      'remote.test',
    ),
  },
  {
    REFUND_TEST_DATABASE_URL: env.REFUND_TEST_DATABASE_URL.replace(
      'refund_review_test',
      'customers',
    ),
  },
  {
    REFUND_TEST_DATABASE_URL: env.REFUND_TEST_DATABASE_URL + '&schema=public',
  },
  {
    REFUND_TEST_DATABASE_URL: env.REFUND_TEST_DATABASE_URL.replace(
      'refund_test@',
      'refund_test:secret@',
    ),
  },
  { REFUND_TEST_DATABASE_DIR: '/private/tmp/other/data' },
  { REFUND_TEST_SOCKET_DIR: '/' },
])('rejects unsafe or incomplete declarations %j', (patch) => {
  expect(() =>
    refundTestDatabase({
      ...env,
      ...patch,
      DATABASE_URL: env.REFUND_TEST_DATABASE_URL,
    }),
  ).toThrow();
});
