import { isAbsolute, normalize } from 'node:path';

const databaseName = 'admin_renewal_test';
type Identity = {
  name: string;
  address: string;
  port: number;
  directory: string;
};

// Test infrastructure only: explicit declaration, never a DATABASE_URL fallback.
// The caller must provision a new owned cluster; server identity is checked before writes.
export function adminRenewalTestDatabase(source: Record<string, string | undefined>) {
  try {
    const value = source.ADMIN_RENEWAL_TEST_DATABASE_URL;
    const directory = source.ADMIN_RENEWAL_TEST_DATABASE_DIR;
    if (source.NODE_ENV !== 'test' || !value || !directory) throw Error();
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      Number(url.port) < 1 ||
      Number(url.port) > 65535 ||
      url.pathname !== `/${databaseName}` ||
      url.search ||
      url.hash ||
      !isAbsolute(directory) ||
      directory === '/' ||
      normalize(directory) !== directory ||
      directory.includes('\0')
    )
      throw Error();
    return {
      url: value,
      identity: {
        name: databaseName,
        address: '127.0.0.1',
        port: Number(url.port),
        directory,
      },
    };
  } catch {
    // Do not reflect the URL, credentials, or untrusted configuration in diagnostics.
    throw Error(
      'Requires NODE_ENV=test, explicit loopback ADMIN_RENEWAL_TEST_DATABASE_URL and absolute ADMIN_RENEWAL_TEST_DATABASE_DIR for a newly owned disposable cluster.',
    );
  }
}

export function assertAdminRenewalTestDatabaseIdentity(
  config: ReturnType<typeof adminRenewalTestDatabase>,
  rows: Identity[],
) {
  const actual = rows[0],
    expected = config.identity;
  if (
    rows.length !== 1 ||
    !actual ||
    actual.name !== expected.name ||
    actual.address !== expected.address ||
    actual.port !== expected.port ||
    actual.directory !== expected.directory
  )
    throw Error(
      'Admin renewal disposable database identity mismatch; no fixture writes permitted.',
    );
}
