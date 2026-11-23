// Owns a fresh socket-only cluster. Never connects to an inherited DATABASE_URL.
import {
  mkdtempSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const socket = realpathSync(mkdtempSync(join(tmpdir(),'rhyze-refund-pg-'))),
  dir = join(socket, 'data'),
  port = '55479';
const url = `postgresql://refund_test@localhost:${port}/refund_review_test?host=${encodeURIComponent(socket)}`;
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DEPLOY_ID: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  COMMIT_REF: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  DATABASE_URL: url,
  REFUND_TEST_DATABASE_URL: url,
  REFUND_TEST_DATABASE_DIR: dir,
  REFUND_TEST_SOCKET_DIR: socket,
  EMAIL_DELIVERY_ENABLED: 'false',
  LC_ALL: 'C',
};
const bin = process.env.PG_BIN ?? '/opt/homebrew/opt/postgresql@17/bin';
function run(command, args, childEnv = env) {
  const cmd = ['initdb', 'pg_ctl', 'createdb', 'psql'].includes(command)
    ? join(bin, command)
    : command;
  const r = spawnSync(cmd, args, { env: childEnv, stdio: 'inherit' });
  if (r.error || r.status !== 0)
    throw Error(`${command} failed (${r.status}): ${r.error?.message ?? ''}`);
}
let started = false;
function stop() {
  if (started) {
    run('pg_ctl', ['-D', dir, '-m', 'fast', '-w', 'stop']);
    started = false;
  }
}
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    stop();
    process.exit(1);
  });
try {
  run('initdb', [
    '-D',
    dir,
    '-U',
    'refund_test',
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
    'refund_test',
    'refund_review_test',
  ]);
  const identity = spawnSync(
    join(bin, 'psql'),
    [
      '-h',
      socket,
      '-p',
      port,
      '-U',
      'refund_test',
      '-d',
      'refund_review_test',
      '-Atc',
      "SELECT current_database()||'|'||current_setting('data_directory')||'|'||current_setting('port')||'|'||current_user||'|'||coalesce(inet_server_addr()::text,'socket')",
    ],
    { env, encoding: 'utf8' },
  );
  if (
    identity.status !== 0 ||
    identity.stdout.trim() !==
      `refund_review_test|${dir}|${port}|refund_test|socket`
  )
    throw Error('Owned identity mismatch before schema writes');
  run('node_modules/.bin/prisma', ['db', 'push', '--skip-generate']);
  for (const migration of [
    '20261113010000_refund_review',
    '20261117160000_special_event_ticket',
    '20261117170000_event_refund_approval',
    '20261117180000_financial_release',
    '20261123010000_special_event_checkout_attempt',
    '20261123011000_checkout_payment_evidence_lock',
    '20261123012000_special_event_guests',
    '20261123013000_special_event_admission_review',
  ]) {
    run('psql', ['-h', socket, '-p', port, '-U', 'refund_test', '-d', 'refund_review_test',
      '-v', 'ON_ERROR_STOP=1', '-f', `prisma/migrations/${migration}/migration.sql`]);
  }
  run('psql', ['-h',socket,'-p',port,'-U','refund_test','-d','refund_review_test','-v','ON_ERROR_STOP=1','-c', 'UPDATE "FinancialRelease" SET generation=1,"enabledDeployId"=\'aaaaaaaaaaaaaaaaaaaaaaaa\',"sourceSha"=\'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\',"evidenceHash"=\'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\',"activatedBy"=\'owned-local-fixture\',"activatedAt"=now() WHERE id=\'rhyze\';']);
  const separator = process.argv.indexOf('--');
  if (separator !== -1) {
    const [command, ...args] = process.argv.slice(separator + 1);
    if (!command) throw Error('Command required after --');
    run(command, args, {
      ...env,
      DATABASE_URL: process.env.DATABASE_URL || url,
    });
  } else
    run('node_modules/.bin/vitest', [
      'run',
      'tests/integration/refund-review.test.ts',
    ]);
} finally {
  stop();
}
