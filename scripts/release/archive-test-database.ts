import { isAbsolute, join, normalize } from 'node:path';

type Identity = {
  dir: string;
  port: number;
  db: string;
  addr: string | null;
  user: string;
};

// This is a declaration, not proof of ownership. The suite must also check the
// connected server identity before its first fixture write. Never use DATABASE_URL.
export function archiveTestDatabase(
  source: Record<string, string | undefined>,
) {
  try {
    const value = source.ARCHIVE_TEST_DATABASE_URL;
    const directory = source.ARCHIVE_TEST_DATABASE_DIR;
    const socket = source.ARCHIVE_TEST_SOCKET_DIR;
    if (source.NODE_ENV !== 'test' || !value || !directory || !socket)
      throw Error();
    for (const path of [directory, socket]) {
      if (
        !isAbsolute(path) ||
        path === '/' ||
        normalize(path) !== path ||
        path.endsWith('/') ||
        path.includes('\0')
      )
        throw Error();
    }
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== 'localhost' ||
      url.username !== 'archive_test' ||
      url.password ||
      !url.port ||
      Number(url.port) < 1 ||
      Number(url.port) > 65535 ||
      url.pathname !== '/archive_phone_test' ||
      url.hash ||
      [...url.searchParams].length !== 1 ||
      url.searchParams.get('host') !== socket ||
      directory !== join(socket, 'data')
    )
      throw Error();
    const identity: Identity = {
      dir: directory,
      port: Number(url.port),
      db: 'archive_phone_test',
      addr: null,
      user: 'archive_test',
    };
    return {
      url: value,
      socket,
      serverLog: join(socket, 'postgres.log'),
      identity,
      assertIdentity(rows: Identity[]) {
        const actual = rows[0];
        if (
          rows.length !== 1 ||
          !actual ||
          actual.dir !== identity.dir ||
          actual.port !== identity.port ||
          actual.db !== identity.db ||
          actual.addr !== identity.addr ||
          actual.user !== identity.user
        ) {
          throw Error(
            'Archive disposable database identity mismatch; no fixture writes permitted.',
          );
        }
      },
    };
  } catch {
    throw Error(
      'Requires NODE_ENV=test, explicit Unix-socket ARCHIVE_TEST_DATABASE_URL, ARCHIVE_TEST_SOCKET_DIR and its absolute data subdirectory ARCHIVE_TEST_DATABASE_DIR for a newly owned disposable cluster.',
    );
  }
}
