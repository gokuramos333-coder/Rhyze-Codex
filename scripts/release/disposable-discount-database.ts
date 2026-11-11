import { isAbsolute, normalize } from 'node:path';

// Test-only declaration, checked before a connection or any fixture write.
export function discountDatabaseDeclaration(env: Record<string, string | undefined>) {
  const value = env.DISCOUNT_TEST_DATABASE_URL;
  const directory = env.DISCOUNT_TEST_DATA_DIRECTORY;
  if (env.NODE_ENV !== 'test' || !value || !directory || !isAbsolute(directory) ||
      directory === '/' || normalize(directory) !== directory || directory.endsWith('/'))
    throw Error('Declare an absolute owned DISCOUNT_TEST_DATA_DIRECTORY in NODE_ENV=test.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
      !url.port || !/^[1-9][0-9]*$/.test(url.port) || Number(url.port) > 65535 ||
      url.pathname !== '/discount_campaign_test' || url.search || url.hash)
    throw Error('Unsafe discount test database: require literal loopback, explicit port and exact disposable database.');
  return { url: value, db: 'discount_campaign_test', host: '127.0.0.1', port: Number(url.port), dir: directory };
}

export async function assertDiscountDatabaseIdentity(
  db: { $queryRawUnsafe: (query: string) => PromiseLike<unknown> },
  declaration: ReturnType<typeof discountDatabaseDeclaration>,
) {
  const rows = await db.$queryRawUnsafe("SELECT current_database() db, host(inet_server_addr()) host, inet_server_port() port, current_setting('data_directory') dir") as {db:string;host:string;port:number;dir:string}[];
  const actual = rows[0];
  if (rows.length !== 1 || !actual || actual.db !== declaration.db || actual.host !== declaration.host ||
      actual.port !== declaration.port || actual.dir !== declaration.dir)
    throw Error('Discount disposable database identity mismatch; no fixture writes permitted.');
}
