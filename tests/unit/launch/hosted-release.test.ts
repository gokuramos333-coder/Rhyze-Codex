import { describe, expect, it } from 'vitest';
const {
  assertHostedApproval,
  assertHostedCandidate,
  assertHostedReceipt,
} = require('../../../scripts/release/hosted-guard.cjs');
const sha = 'a'.repeat(40);
const approval = {
  databaseIdentity: 'd'.repeat(64),
  version: 1,
  revision: sha,
  nonce: 'b'.repeat(48),
  expiresAt: Date.now() + 60_000,
};
const env = {
  CONTEXT: 'production',
  BRANCH: 'production-reviewed',
  SITE_ID: 'e7002b82-50f2-4760-8a35-e4f9591bec4f',
  COMMIT_REF: sha,
  RHYZE_HOSTED_RELEASE: JSON.stringify(approval),
};
describe('hosted production release gates', () => {
  it('accepts only the explicitly approved production source', () => {
    expect(assertHostedApproval(env, sha)).toEqual(approval);
  });
  it.each([
    'CONTEXT',
    'BRANCH',
    'SITE_ID',
    'COMMIT_REF',
    'RHYZE_HOSTED_RELEASE',
  ])('rejects missing/wrong %s', (key) => {
    expect(() =>
      assertHostedApproval({ ...env, [key]: 'wrong' }, sha),
    ).toThrow();
  });
  it('rejects expired or mismatched approval', () => {
    for (const patch of [
      { expiresAt: 0 },
      { revision: 'c'.repeat(40) },
      { nonce: '' },
    ]) {
      expect(() =>
        assertHostedApproval(
          {
            ...env,
            RHYZE_HOSTED_RELEASE: JSON.stringify({ ...approval, ...patch }),
          },
          sha,
        ),
      ).toThrow();
    }
  });
  const deploy = {
    id: 'new',
    site_id: env.SITE_ID,
    context: 'production',
    branch: env.BRANCH,
    commit_ref: sha,
    state: 'ready',
    build_id: 'build',
    draft: false,
  };
  it('rejects preview, wrong source, failed or unrelated artifacts', () => {
    expect(() =>
      assertHostedCandidate(deploy, {
        revision: sha,
        buildId: 'build',
        deployId: 'new',
      }),
    ).not.toThrow();
    for (const patch of [
      { context: 'deploy-preview' },
      { commit_ref: 'c'.repeat(40) },
      { state: 'error' },
      { build_id: 'other' },
      { id: 'other' },
      { draft: true },
    ]) {
      expect(() =>
        assertHostedCandidate(
          { ...deploy, ...patch },
          { revision: sha, buildId: 'build', deployId: 'new' },
        ),
      ).toThrow();
    }
  });
  it('requires the exact receipt, including database privilege verification', () => {
    const receipt = {
      databaseIdentity: approval.databaseIdentity,
      version: 1,
      revision: sha,
      nonce: approval.nonce,
      databasePrivileges: true,
    };
    expect(() => assertHostedReceipt(receipt, approval)).not.toThrow();
    for (const patch of [
      { revision: '' },
      { nonce: 'old' },
      { databaseIdentity: 'e'.repeat(64) },
      { databasePrivileges: false },
    ]) {
      expect(() =>
        assertHostedReceipt({ ...receipt, ...patch }, approval),
      ).toThrow();
    }
  });
});

import { afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const {
  verifyHostedSnapshot,
  verifyDatabasePrivileges,
} = require('../../../scripts/release/hosted-guard.cjs');
const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'hosted-guard-'));
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  git('init');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  mkdirSync(join(root, 'public'));
  writeFileSync(join(root, 'public/a.txt'), 'reviewed');
  git('add', '.');
  git('commit', '-m', 'fixture');
  return { root, sha: git('rev-parse', 'HEAD') };
}
describe('hosted source and database verification', () => {
  it.each(['added', 'modified', 'missing', 'symlink', 'receipt'])(
    'blocks %s source drift',
    (change) => {
      const { root, sha } = fixture();
      verifyHostedSnapshot(root, sha);
      if (change === 'added')
        writeFileSync(join(root, 'new-route.js'), 'unreviewed');
      if (change === 'modified')
        writeFileSync(join(root, 'public/a.txt'), 'changed');
      if (change === 'missing') rmSync(join(root, 'public/a.txt'));
      if (change === 'symlink')
        symlinkSync(join(root, 'public/a.txt'), join(root, 'copy'));
      if (change === 'receipt')
        writeFileSync(join(root, 'public/_rhyze-release.json'), '{}');
      expect(() => verifyHostedSnapshot(root, sha)).toThrow();
    },
  );
  it('allows only the generated exact receipt and known output directories', () => {
    const { root, sha } = fixture();
    const receipt = { revision: sha, nonce: 'release' };
    writeFileSync(
      join(root, 'public/_rhyze-release.json'),
      JSON.stringify(receipt),
    );
    mkdirSync(join(root, '.next'));
    writeFileSync(join(root, '.next/output'), 'generated');
    expect(() => verifyHostedSnapshot(root, sha, receipt)).not.toThrow();
    expect(() => verifyHostedSnapshot(root, 'f'.repeat(40), receipt)).toThrow();
  });
  it('checks each privilege separately inside a read-only transaction', async () => {
    const tx = {
      $executeRawUnsafe: vi.fn(),
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ allowed: true }]),
    };
    const db = {
      $transaction: (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    };
    await verifyDatabasePrivileges(db);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledExactlyOnceWith(
      'SET TRANSACTION READ ONLY',
    );
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(16);
    expect(tx.$queryRawUnsafe.mock.calls.map((c) => c[2])).toEqual(
      Array(4).fill(['SELECT', 'INSERT', 'UPDATE', 'DELETE']).flat(),
    );
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ allowed: false }]);
    await expect(verifyDatabasePrivileges(db)).rejects.toThrow(/privileges/);
  });
});

const {
  runHostedWorkflow,
} = require('../../../scripts/release/hosted-workflow.cjs');
describe('hosted publication failure paths', () => {
  function steps(fail?: string) {
    return Object.fromEntries(
      [
        'prepare',
        'publish',
        'lock',
        'verify',
        'removeApproval',
        'ensureLocked',
        'patOff',
      ].map((name) => [
        name,
        vi.fn(async () => {
          if (name === fail) throw Error(name);
        }),
      ]),
    );
  }
  it.each([
    'prepare',
    'publish',
    'lock',
    'verify',
    'removeApproval',
    'ensureLocked',
    'patOff',
  ])('fails closed and attempts all cleanup after %s failure', async (fail) => {
    const calls = steps(fail);
    const result = await runHostedWorkflow(calls);
    expect(result.status).not.toBe('VERIFIED');
    expect(calls.publish).toHaveBeenCalledTimes(fail === 'prepare' ? 0 : 1);
    for (const name of ['removeApproval', 'ensureLocked', 'patOff'])
      expect(calls[name]).toHaveBeenCalledOnce();
  });
  it('records VERIFIED only after publication, live checks and all cleanup succeed', async () => {
    const result = await runHostedWorkflow(steps());
    expect(result.status).toBe('VERIFIED');
    expect(result.publicationAttempted).toBe(true);
  });
});

const { requestNetlify } = require('../../../scripts/release/hosted-api.cjs');
describe('provider mutation transport', () => {
  it('does not retry an uncertain publication or leak transport secrets', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(Error('Bearer secret-token postgres://secret'));
    await expect(
      requestNetlify(
        'restoreSiteDeploy',
        { deploy_id: 'candidate' },
        'private-token',
        fetcher,
      ),
    ).rejects.toThrow('Sensitive output withheld');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
  });
  it('sends scoped approval JSON as the request body', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => '[]' });
    const body = [
      {
        key: 'RHYZE_HOSTED_RELEASE',
        scopes: ['builds'],
        values: [{ context: 'production', value: '{}' }],
      },
    ];
    await requestNetlify('createEnvVars', { body }, 'token', fetcher);
    expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify(body));
  });
  it('refuses another site before sending anything', async () => {
    const fetcher = vi.fn();
    await expect(
      requestNetlify('getSite', { site_id: 'another' }, 'token', fetcher),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it('pins the same database regardless of readonly vs application credentials', () => {
  const {
    databaseIdentity,
  } = require('../../../scripts/release/hosted-guard.cjs');
  const first = databaseIdentity(
    'postgres://netlifydb_readonly:one@db.example.com/app',
  );
  expect(
    databaseIdentity('postgres://netlifydb_owner:two@db.example.com/app'),
  ).toBe(first);
  expect(
    databaseIdentity('postgres://netlifydb_owner:two@other.example.com/app'),
  ).not.toBe(first);
  expect(
    databaseIdentity('postgres://netlifydb_owner:two@db.example.com/other'),
  ).not.toBe(first);
});

it('uses the immutable deploy ID URL even when the provider returns a branch alias', () => {
  const {
    immutableDeployOrigin,
  } = require('../../../scripts/release/hosted-guard.cjs');
  const deploy = {
    id: '6ab9e6ccdb1348d2d7b52edc',
    site_id: env.SITE_ID,
    deploy_ssl_url:
      'https://production-reviewed--rhyze-fitness-rhyze-2.netlify.app',
  };
  expect(immutableDeployOrigin(deploy)).toBe(
    'https://6ab9e6ccdb1348d2d7b52edc--rhyze-fitness-rhyze-2.netlify.app',
  );
  expect(() => immutableDeployOrigin({ ...deploy, id: '../wrong' })).toThrow();
  expect(() =>
    immutableDeployOrigin({ ...deploy, site_id: 'wrong' }),
  ).toThrow();
});
