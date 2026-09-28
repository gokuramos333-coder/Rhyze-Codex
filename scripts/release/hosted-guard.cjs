const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const SITE_ID = 'e7002b82-50f2-4760-8a35-e4f9591bec4f';
const BRANCH = 'production-reviewed';
const APPROVAL_KEY = 'RHYZE_HOSTED_RELEASE';
const RECEIPT_PATH = 'public/_rhyze-release.json';
function databaseIdentity(value) {
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname
  )
    throw Error('Invalid DB identity.');
  return createHash('sha256')
    .update(JSON.stringify([url.hostname, url.port || '5432', url.pathname]))
    .digest('hex');
}
function assertHostedApproval(env, revision, now = Date.now()) {
  const approval = JSON.parse(env[APPROVAL_KEY] || '{}');
  if (
    env.CONTEXT !== 'production' ||
    env.BRANCH !== BRANCH ||
    env.SITE_ID !== SITE_ID ||
    env.COMMIT_REF !== revision ||
    !/^[a-f0-9]{40}$/.test(revision) ||
    approval.version !== 1 ||
    approval.revision !== revision ||
    !/^[a-f0-9]{64}$/.test(approval.databaseIdentity || '') ||
    !/^[a-f0-9]{48}$/.test(approval.nonce || '') ||
    !Number.isFinite(approval.expiresAt) ||
    approval.expiresAt <= now ||
    approval.expiresAt > now + 2 * 60 * 60 * 1000
  )
    throw Error(
      'Hosted build has no valid approval for this exact source/site/context.',
    );
  return approval;
}
function assertHostedCandidate(deploy, expected) {
  if (
    deploy.id !== expected.deployId ||
    deploy.build_id !== expected.buildId ||
    deploy.site_id !== SITE_ID ||
    deploy.context !== 'production' ||
    deploy.branch !== BRANCH ||
    deploy.commit_ref !== expected.revision ||
    deploy.state !== 'ready' ||
    deploy.draft ||
    deploy.error_message
  )
    throw Error(
      'Hosted artifact identity/context/readiness mismatch; publication blocked.',
    );
}
function assertHostedReceipt(receipt, approval) {
  if (
    receipt.version !== 1 ||
    receipt.revision !== approval.revision ||
    receipt.nonce !== approval.nonce ||
    receipt.databaseIdentity !== approval.databaseIdentity ||
    receipt.databasePrivileges !== true
  )
    throw Error('Hosted source/database receipt does not match this release.');
}
function receiptFor(approval) {
  return {
    version: 1,
    revision: approval.revision,
    nonce: approval.nonce,
    databaseIdentity: approval.databaseIdentity,
    databasePrivileges: true,
  };
}
function verifyHostedSnapshot(root, revision, receipt) {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  if (
    git('rev-parse', 'HEAD').trim() !== revision ||
    fs.realpathSync(git('rev-parse', '--show-toplevel').trim()) !==
      fs.realpathSync(root)
  )
    throw Error('Hosted checkout identity changed.');
  const expected = new Map(
    git('ls-tree', '-rz', revision)
      .split('\0')
      .filter(Boolean)
      .map((row) => {
        const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(row);
        if (
          !match ||
          (/^\.env(?:\.|$)/.test(match[3]) && match[3] !== '.env.example') ||
          match[3] === RECEIPT_PATH
        )
          throw Error('Unsupported or sensitive tracked source.');
        return [match[3], match[2]];
      }),
  );
  const seen = new Set();
  function walk(dir, prefix = '') {
    for (const name of fs.readdirSync(dir)) {
      const relative = prefix + name;
      const file = path.join(dir, name);
      const info = fs.lstatSync(file);
      if (info.isSymbolicLink()) throw Error('Symlink in hosted source.');
      if (
        !prefix &&
        ['.git', 'node_modules', '.next', '.next-build', '.netlify'].includes(
          name,
        )
      ) {
        if (!info.isDirectory()) throw Error('Unexpected generated-root type.');
        continue;
      }
      if (info.isDirectory()) {
        walk(file, relative + '/');
        continue;
      }
      if (!info.isFile()) throw Error('Non-regular hosted source.');
      if (
        !expected.has(relative) &&
        ['next-env.d.ts', 'tsconfig.tsbuildinfo'].includes(relative)
      )
        continue;
      const bytes = fs.readFileSync(file);
      if (
        relative === RECEIPT_PATH &&
        receipt &&
        bytes.toString() === JSON.stringify(receipt)
      )
        continue;
      const blob = createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex');
      if (expected.get(relative) !== blob)
        throw Error('Hosted source changed or contains unreviewed files.');
      seen.add(relative);
    }
  }
  walk(root);
  if (seen.size !== expected.size) throw Error('Hosted source file missing.');
}
async function verifyDatabasePrivileges(db) {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    for (const table of ['User', 'Purchase', 'Booking', 'StripeEvent']) {
      for (const permission of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const result = await tx.$queryRawUnsafe(
          'SELECT has_table_privilege(current_user, $1, $2) AS allowed',
          `public."${table}"`,
          permission,
        );
        if (!result[0]?.allowed)
          throw Error('Managed database binding lacks application privileges.');
      }
    }
  });
}
async function hostedGuard({ constants }, final) {
  try {
    const root = process.cwd();
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (
      constants.IS_LOCAL ||
      constants.SITE_ID !== SITE_ID ||
      fs.realpathSync(path.dirname(constants.CONFIG_PATH)) !==
        fs.realpathSync(root)
    )
      throw Error();
    const approval = assertHostedApproval(process.env, revision);
    const receipt = receiptFor(approval);
    verifyHostedSnapshot(root, revision, final ? receipt : undefined);
    if (
      process.env.NEXT_PUBLIC_APP_URL !== 'https://www.rhyzefitness.com' ||
      !/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || '') ||
      !/^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET || '')
    )
      throw Error();
    if (!final) {
      // Only the platform-managed binding is accepted; no local PAT connection.
      const value = process.env.NETLIFY_DB_URL;
      const url = new URL(value);
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !url.password ||
        /readonly/i.test(url.username) ||
        databaseIdentity(value) !== approval.databaseIdentity
      )
        throw Error();
      execFileSync(
        process.execPath,
        [path.join(root, 'node_modules/prisma/build/index.js'), 'generate'],
        { stdio: 'pipe', timeout: 120000 },
      );
      const { PrismaClient } = require('@prisma/client');
      const db = new PrismaClient({ datasourceUrl: value });
      try {
        await verifyDatabasePrivileges(db);
      } finally {
        await db.$disconnect();
      }
      fs.writeFileSync(path.join(root, RECEIPT_PATH), JSON.stringify(receipt));
    }
    console.info(
      `Rhyze hosted release ${final ? 'post-build' : 'pre-build'} guard passed for ${revision}.`,
    );
  } catch {
    throw Error(
      'Rhyze hosted release guard blocked this build; verify approval, source, LIVE configuration and managed database access. Sensitive details withheld.',
    );
  }
}
module.exports = {
  databaseIdentity,
  SITE_ID,
  BRANCH,
  APPROVAL_KEY,
  RECEIPT_PATH,
  assertHostedApproval,
  assertHostedCandidate,
  assertHostedReceipt,
  receiptFor,
  verifyHostedSnapshot,
  verifyDatabasePrivileges,
  hostedGuard,
};
