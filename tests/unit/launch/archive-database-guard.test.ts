import { expect, it } from 'vitest';
import { archiveTestDatabase } from '@/scripts/release/archive-test-database';
const env = {
  NODE_ENV: 'test',
  ARCHIVE_TEST_DATABASE_URL:
    'postgresql://archive_test@localhost:55473/archive_phone_test?host=%2Fprivate%2Ftmp%2Fowned-archive',
  ARCHIVE_TEST_DATABASE_DIR: '/private/tmp/owned-archive/data',
  ARCHIVE_TEST_SOCKET_DIR: '/private/tmp/owned-archive',
};
it('requires exact declared server identity before fixture writes', () => {
  const config = archiveTestDatabase(env);
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
  { ARCHIVE_TEST_DATABASE_URL: undefined },
  { ARCHIVE_TEST_DATABASE_DIR: undefined },
  { ARCHIVE_TEST_SOCKET_DIR: undefined },
  {
    ARCHIVE_TEST_DATABASE_URL: env.ARCHIVE_TEST_DATABASE_URL.replace(
      'localhost',
      'remote.test',
    ),
  },
  {
    ARCHIVE_TEST_DATABASE_URL: env.ARCHIVE_TEST_DATABASE_URL.replace(
      'archive_phone_test',
      'customers',
    ),
  },
  {
    ARCHIVE_TEST_DATABASE_URL: env.ARCHIVE_TEST_DATABASE_URL + '&schema=public',
  },
  {
    ARCHIVE_TEST_DATABASE_URL: env.ARCHIVE_TEST_DATABASE_URL.replace(
      'archive_test@',
      'archive_test:secret@',
    ),
  },
  { ARCHIVE_TEST_DATABASE_DIR: '/private/tmp/other/data' },
  { ARCHIVE_TEST_SOCKET_DIR: '/' },
])('rejects unsafe or incomplete declarations %j', (patch) => {
  expect(() =>
    archiveTestDatabase({
      ...env,
      ...patch,
      DATABASE_URL: env.ARCHIVE_TEST_DATABASE_URL,
    }),
  ).toThrow();
});
