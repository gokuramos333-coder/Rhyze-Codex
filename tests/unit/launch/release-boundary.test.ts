import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const {
  assertIsolatedLocation,
  verifySnapshot,
  acquireReleaseLock,
  verifyBoundary,
  environmentFingerprint,
} = require('../../../scripts/release/boundary.cjs');
const roots: string[] = [];
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'rhyze-boundary-test-'));
  roots.push(root);
  const hashes = [
    ['package.json', '{}'],
    ['app/page.ts', 'export default 1'],
    ['netlify.toml', '[build]'],
  ].map(([name, body]) => {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), body);
    return [name, createHash('sha256').update(body).digest('hex')];
  });
  return { root, hashes };
};
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);

describe('Netlify final build boundary', () => {
  it('normalizes context ordering without mutating the input', () => {
    const first = [{ key: 'A', values: [{ context: 'production', value: 'live' }, { context: 'dev', value: 'test' }] }];
    const before = JSON.stringify(first);
    const reordered = [{ key: 'A', values: [...first[0].values].reverse() }];
    expect(environmentFingerprint(first)).toBe(environmentFingerprint(reordered));
    expect(JSON.stringify(first)).toBe(before);
  });
  it.each(['value', 'context', 'scope', 'key', 'timestamp', 'added', 'removed'])(
    'still blocks an actual environment change: %s', (change) => {
      const { root, hashes } = fixture();
      const before = [{ key: 'A', scopes: ['builds', 'functions'], updated_at: '2026-09-22', values: [{ context: 'production', value: 'live' }] }];
      const after = structuredClone(before);
      if (change === 'value') after[0].values[0].value = 'test';
      if (change === 'context') after[0].values[0].context = 'dev';
      if (change === 'scope') after[0].scopes.pop();
      if (change === 'key') after[0].key = 'B';
      if (change === 'timestamp') after[0].updated_at = '2026-09-23';
      if (change === 'added') after.push({ ...after[0], key: 'B' });
      if (change === 'removed') after.pop();
      expect(() => verifyBoundary({ root, hashes, siteId: 'expected-site', expectedDeploy: 'old', configHash: environmentFingerprint(before) },
        { root, siteId: 'expected-site' }, (operation: string) => operation === 'getSite'
          ? { id: 'expected-site', published_deploy: { id: 'old' } } : after,
      )).toThrow(/configuration changed/);
    },
  );
  it('accepts unchanged environment settings returned in a different API order', () => {
    const { root, hashes } = fixture();
    const config = [
      { key: 'A', scopes: ['builds', 'functions'], values: [{ context: 'production', value: 'one' }] },
      { key: 'B', scopes: ['builds'], values: [{ context: 'production', value: 'two' }] },
    ];
    const manifest = {
      root, hashes, siteId: 'expected-site', expectedDeploy: 'old',
      configHash: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
    };
    const reordered = [...config].reverse().map((item) => ({
      values: item.values, scopes: [...item.scopes].reverse(), key: item.key,
    }));
    expect(() => verifyBoundary(manifest, { root, siteId: 'expected-site' },
      (operation: string) => operation === 'getSite'
        ? { id: 'expected-site', published_deploy: { id: 'old' } }
        : reordered,
    )).not.toThrow();
  });
  it('runs the actual post-build plugin before recording permission to publish', () => {
    const { root, hashes } = fixture();
    const control = mkdtempSync(join(tmpdir(), 'rhyze-plugin-test-'));
    roots.push(control);
    const manifest = {
      root,
      hashes,
      siteId: 'expected-site',
      expectedDeploy: 'old',
      configHash: createHash('sha256').update('[]').digest('hex'),
      revision: 'reviewed-source',
      boundaryReceipt: join(control, 'receipt.json'),
    };
    writeFileSync(join(control, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(
      join(control, 'cli.cjs'),
      `process.stdout.write(JSON.stringify(process.argv[3] === 'getSite' ? {id:'expected-site',published_deploy:{id:'old'}} : []));`,
    );
    const script = `require(${JSON.stringify(resolve('plugins/release-safety/index.js'))}).onPostBuild({constants:{CONFIG_PATH:${JSON.stringify(join(root, 'netlify.toml'))},SITE_ID:'expected-site',IS_LOCAL:true}})`;
    const env = {
      PATH: process.env.PATH,
      NODE_ENV: 'test' as const,
      CONTEXT: 'production',
      RHYZE_RELEASE_MANIFEST: join(control, 'manifest.json'),
      RHYZE_RELEASE_NETLIFY_CLI: join(control, 'cli.cjs'),
    };
    execFileSync(process.execPath, ['-e', script], {
      cwd: root,
      env,
      stdio: 'pipe',
    });
    expect(
      JSON.parse(readFileSync(join(control, 'receipt.json'), 'utf8')),
    ).toMatchObject({
      sourceCommit: 'reviewed-source',
      expectedDeploy: 'old',
      passed: true,
    });
    writeFileSync(
      join(control, 'cli.cjs'),
      `process.stdout.write(JSON.stringify({id:'expected-site',published_deploy:{id:'newer-release'}}));`,
    );
    expect(() =>
      execFileSync(process.execPath, ['-e', script], {
        cwd: root,
        env,
        stdio: 'pipe',
      }),
    ).toThrow();
  });
  it('blocks an unguarded production build before the build command runs', () => {
    const script = `require(${JSON.stringify(resolve('plugins/release-safety/index.js'))}).onPreBuild({constants:{IS_LOCAL:true}})`;
    expect(() =>
      execFileSync(process.execPath, ['-e', script], {
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'test',
          CONTEXT: 'production',
        },
        stdio: 'pipe',
      }),
    ).toThrow();
  });
  it('rejects nested package/git roots that redirect the Netlify build to another checkout', () => {
    const { root } = fixture();
    const nested = join(root, 'nested');
    mkdirSync(nested);
    expect(() => assertIsolatedLocation(root)).not.toThrow();
    expect(() => assertIsolatedLocation(nested)).toThrow(/ancestor|isolat/i);
  });
  it.each(['new-route', 'modified', 'symlink', 'env-file'])(
    'rejects source drift after tests: %s',
    (change) => {
      const { root, hashes } = fixture();
      if (change === 'new-route')
        writeFileSync(join(root, 'app/new.ts'), 'new behavior');
      if (change === 'modified')
        writeFileSync(join(root, 'app/page.ts'), 'different behavior');
      if (change === 'env-file')
        writeFileSync(join(root, '.env.local'), 'SECRET=wrong');
      if (change === 'symlink') {
        unlinkSync(join(root, 'app/page.ts'));
        writeFileSync(join(root, 'target'), 'export default 1');
        symlinkSync(join(root, 'target'), join(root, 'app/page.ts'));
      }
      expect(() => verifySnapshot(root, hashes)).toThrow();
    },
  );
  it('allows only known generated output, and refuses a symlinked dependency directory', () => {
    const { root, hashes } = fixture();
    mkdirSync(join(root, '.next'));
    writeFileSync(join(root, '.next/build.json'), '{}');
    writeFileSync(join(root, 'next-env.d.ts'), '// generated');
    expect(() => verifySnapshot(root, hashes)).not.toThrow();
    symlinkSync(join(root, '.next'), join(root, 'node_modules'));
    expect(() => verifySnapshot(root, hashes)).toThrow();
  });
  it('serializes two local releases and only releases its own lock', () => {
    const { root } = fixture();
    const path = join(root, 'release.lock');
    const release = acquireReleaseLock(path);
    expect(() => acquireReleaseLock(path)).toThrow(/lock|release/i);
    release();
    const again = acquireReleaseLock(path);
    again();
  });
  it.each(['concurrent-deploy', 'configuration-change', 'wrong-build-root'])(
    'blocks publication after the build when %s is detected',
    (fault) => {
      const { root, hashes } = fixture();
      const config = [{ key: 'example', values: [] }];
      const manifest = {
        root,
        hashes,
        siteId: 'expected-site',
        expectedDeploy: 'old',
        configHash: createHash('sha256')
          .update(JSON.stringify(config))
          .digest('hex'),
      };
      const current = { id: 'expected-site', published_deploy: { id: 'old' } };
      const api = (operation: string) =>
        operation === 'getSite'
          ? {
              ...current,
              published_deploy: {
                id: fault === 'concurrent-deploy' ? 'other-release' : 'old',
              },
            }
          : fault === 'configuration-change'
            ? []
            : config;
      expect(() =>
        verifyBoundary(
          manifest,
          {
            root: fault === 'wrong-build-root' ? '/different-checkout' : root,
            siteId: 'expected-site',
          },
          api,
        ),
      ).toThrow();
    },
  );
});
