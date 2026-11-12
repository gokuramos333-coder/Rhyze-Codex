// Creates its own cluster, applies the exact new migration and always stops it.
// With -- <command> [args], keeps the fixture alive for a full supported release check.
import {
  mkdtempSync,
  realpathSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const socket = realpathSync(mkdtempSync(join(tmpdir(), 'rhyze-archive-')));
const dir = join(socket, 'data');
const port = '55473'; // Isolated socket namespace; no TCP listener.
const url = `postgresql://archive_test@localhost:${port}/archive_phone_test?host=${encodeURIComponent(socket)}`;
const env = {
  ...process.env,
  NODE_ENV: 'test',
  LC_ALL: 'C',
  DATABASE_URL: url,
  EMAIL_DELIVERY_ENABLED: 'false',
  ARCHIVE_TEST_DATABASE_URL: url,
  ARCHIVE_TEST_DATABASE_DIR: dir,
  ARCHIVE_TEST_SOCKET_DIR: socket,
};
function run(cmd, args, childEnv = env) {
  const executable =
    process.env.PG_BIN && ['initdb', 'pg_ctl', 'createdb', 'psql'].includes(cmd)
      ? join(process.env.PG_BIN, cmd)
      : cmd;
  const result = spawnSync(executable, args, {
    env: childEnv,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0)
    throw new Error(`${cmd} failed (${result.status})`);
}
let started = false;
function stop() {
  if (!started) return;
  run('pg_ctl', ['-D', dir, '-m', 'fast', '-w', 'stop']);
  started = false;
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stop();
    process.exit(1);
  });
try {
  run('initdb', [
    '-D',
    dir,
    '-U',
    'archive_test',
    '--auth=trust',
    '--no-locale',
    '--encoding=UTF8',
    '-c',
    'shared_memory_type=mmap',
    '-c',
    'dynamic_shared_memory_type=mmap',
  ]);
  run('pg_ctl', [
    '-D',
    dir,
    '-l',
    join(socket, 'postgres.log'),
    '-o',
    `-k ${socket} -p ${port} -c listen_addresses=''`,
    '-w',
    'start',
  ]);
  started = true;
  run('createdb', [
    '-h',
    socket,
    '-p',
    port,
    '-U',
    'archive_test',
    'archive_phone_test',
  ]);
  const psql = process.env.PG_BIN ? join(process.env.PG_BIN, 'psql') : 'psql';
  const identity = spawnSync(
    psql,
    [
      '-h',
      socket,
      '-p',
      port,
      '-U',
      'archive_test',
      '-d',
      'archive_phone_test',
      '-Atc',
      "SELECT current_database() || '|' || current_setting('data_directory') || '|' || current_setting('port') || '|' || current_user || '|' || coalesce(inet_server_addr()::text,'socket')",
    ],
    { env, encoding: 'utf8' },
  );
  if (
    identity.status !== 0 ||
    identity.stdout.trim() !==
      `archive_phone_test|${dir}|${port}|archive_test|socket`
  )
    throw new Error(
      'Owned database identity mismatch; no schema or fixture writes permitted.',
    );
  const schema = readFileSync('prisma/schema.prisma', 'utf8').replace(
    '  archivedAt             DateTime?\n',
    '',
  );
  const baseline = join(socket, 'baseline.prisma');
  writeFileSync(baseline, schema);
  run('node_modules/.bin/prisma', [
    'db',
    'push',
    '--schema',
    baseline,
    '--skip-generate',
  ]);
  run('psql', [
    '-h',
    socket,
    '-p',
    port,
    '-U',
    'archive_test',
    '-d',
    'archive_phone_test',
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    'prisma/migrations/20261112220000_client_archive/migration.sql',
  ]);
  const separator = process.argv.indexOf('--');
  if (separator !== -1) {
    const [command, ...args] = process.argv.slice(separator + 1);
    if (!command) throw new Error('Supply a command after --');
    // Preserve the full release's other test database declarations.
    run(command, args, {
      ...env,
      DATABASE_URL: process.env.DATABASE_URL || url,
    });
  } else
    run('node_modules/.bin/vitest', [
      'run',
      'tests/integration/archive-phone.test.ts',
    ]);
} finally {
  stop();
}
