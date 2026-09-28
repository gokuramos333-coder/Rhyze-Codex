import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertProductionDeploy,
  assertProductionEnvironment,
  assertApplicationDatabase,
  releaseTestEnvironment,
  assertMigrationMirrors,
  productionDeployArgs,
  parseOptions,
  redact,
  SITE_ID,
  netlifyEnvironment,
} from '../../../scripts/release/guards';
import {
  runRelease,
  type ReleaseSteps,
} from '../../../scripts/release/workflow';

const deploy = {
  id: 'old-deploy',
  site_id: 'e7002b82-50f2-4760-8a35-e4f9591bec4f',
  state: 'ready',
  context: 'production',
  created_at: '2026-09-22T16:00:00Z',
  title: 'abcdef0 LIVE Stripe release',
};
const site = {
  id: deploy.site_id,
  name: 'rhyze-fitness-rhyze-2',
  ssl_url: 'https://www.rhyzefitness.com',
  published_deploy: { id: deploy.id },
};
const environment = () =>
  ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NEXT_PUBLIC_APP_URL'].map(
    (key) => ({
      key,
      scopes: ['builds', 'functions'],
      updated_at: '2026-09-21T00:00:00Z',
      values: [
        {
          context: 'production',
          value:
            key === 'NEXT_PUBLIC_APP_URL'
              ? 'https://www.rhyzefitness.com'
              : '********abcd',
        },
        { context: 'deploy-preview', value: 'sk_test_not_for_production' },
      ],
    }),
  );
const localEnv = {
  DATABASE_URL: 'postgresql://tester@127.0.0.1:55439/callback_test',
  CALLBACK_TEST_DATABASE_URL:
    'postgresql://tester@127.0.0.1:55439/callback_test',
  IDENTITY_TEST_DATABASE_URL:
    'postgresql://tester@127.0.0.1:55439/identity_migration',
  VIP_TEST_DATABASE_URL:
    'postgresql://tester@127.0.0.1:55439/identity_migration',
  PLAN_CHANGE_TEST_DATABASE_URL:
    'postgresql://tester@127.0.0.1:55439/membership_plan_test',
};
const dirs: string[] = [];
afterEach(() =>
  dirs
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);

describe('release input and production isolation', () => {
  it('does not let an environment site ID make Netlify skip writing the snapshot link', () => {
    const env = {
      PATH: '/bin',
      NETLIFY_SITE_ID: 'wrong-inherited-site',
      STRIPE_SECRET_KEY: 'sk_live_not_inherited',
    };
    expect(netlifyEnvironment(env, 'link').NETLIFY_SITE_ID).toBeUndefined();
    expect(netlifyEnvironment(env, 'api').NETLIFY_SITE_ID).toBe(
      'e7002b82-50f2-4760-8a35-e4f9591bec4f',
    );
    expect(netlifyEnvironment(env, 'link').STRIPE_SECRET_KEY).toBeUndefined();
  });
  it('requires a pinned deployed revision and rejects any bypass/deploy-preview flags', () => {
    for (const args of [
      [],
      ['publish'],
      ['check', '--no-build'],
      ['publish', '--prod'],
      ['verify', '--expected-deploy', ''],
    ]) {
      expect(() => parseOptions(args)).toThrow();
    }
    expect(
      parseOptions([
        'check',
        '--expected-deploy',
        'abc123',
        '--base-ref',
        'abcdef0',
      ]),
    ).toEqual({ mode: 'check', expectedDeploy: 'abc123', baseRef: 'abcdef0' });
  });
  it('the npm publishing entrypoint refuses invocation without reviewed release inputs', () => {
    const command = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
      .scripts['deploy:production'];
    const [bin, ...args] = command.split(' ');
    // Never execute an arbitrary changed npm command in a regression test: a
    // reversion to raw `netlify deploy` must fail BEFORE any child is started.
    expect(bin).toBe('tsx');
    expect(args).toEqual(['scripts/release/hosted.ts']);
    let result = '';
    try {
      execFileSync(resolve('node_modules/.bin', bin), args, {
        encoding: 'utf8',
        timeout: 10000,
        env: { PATH: process.env.PATH, NODE_ENV: 'test' },
        stdio: 'pipe',
      });
    } catch (error) {
      result = String((error as { stderr?: string }).stderr);
    }
    expect(result).toMatch(/expected-deploy|base-ref|release inputs/i);
  });
  it('accepts only the expected published production artifact', () => {
    expect(() =>
      assertProductionDeploy(site, deploy, 'old-deploy'),
    ).not.toThrow();
    for (const invalid of [
      { context: 'deploy-preview' },
      { state: 'error' },
      { site_id: 'another-site' },
      { id: 'new-concurrent-deploy' },
    ]) {
      expect(() =>
        assertProductionDeploy(site, { ...deploy, ...invalid }, 'old-deploy'),
      ).toThrow();
    }
    expect(() =>
      assertProductionDeploy(
        { ...site, id: 'another-site' },
        deploy,
        'old-deploy',
      ),
    ).toThrow();
  });
  it('never turns masked keys into a claim of verified LIVE credentials', () => {
    expect(
      assertProductionEnvironment(environment(), deploy.created_at),
    ).toEqual({ credentialsMasked: true });
  });
  it.each([
    'test-key',
    'missing-function-scope',
    'recent-change',
    'missing-production',
    'wrong-domain',
  ])('blocks unsafe production configuration: %s', (variant) => {
    const vars = environment();
    if (variant === 'test-key') vars[0].values[0].value = 'sk_test_wrong';
    if (variant === 'missing-function-scope') vars[0].scopes = ['builds'];
    if (variant === 'recent-change')
      vars[0].updated_at = '2026-09-22T17:00:00Z';
    if (variant === 'missing-production') vars[0].values.shift();
    if (variant === 'wrong-domain')
      vars[2].values[0].value = 'http://localhost:3000';
    expect(() =>
      assertProductionEnvironment(vars, deploy.created_at),
    ).toThrow();
  });
  it('rejects read-only, missing, masked, and malformed application DB credentials without exposing them', () => {
    for (const url of [
      '',
      'postgresql://netlifydb_readonly:secret@db.test/app',
      'postgresql://owner:***@db.test/app',
      'https://owner:secret@db.test/app',
      'postgresql://owner@db.test/app',
    ]) {
      expect(() => assertApplicationDatabase(url)).toThrow(/binding|database/i);
      try {
        assertApplicationDatabase(url);
      } catch (error) {
        expect(String(error)).not.toContain('secret@');
      }
    }
    expect(() =>
      assertApplicationDatabase(
        'postgresql://netlifydb_owner:secret@db.test/app',
      ),
    ).not.toThrow();
  });
  it('requires every integration database and strips inherited live credentials and config', () => {
    const env = releaseTestEnvironment({
      ...localEnv,
      STRIPE_SECRET_KEY: 'sk_live_secret',
      RESEND_API_KEY: 're_secret',
      NETLIFY: 'true',
      NEXT_PUBLIC_APP_URL: 'https://www.rhyzefitness.com',
    });
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.NETLIFY).toBeUndefined();
    expect(env.EMAIL_DELIVERY_ENABLED).toBe('false');
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
    expect(() =>
      releaseTestEnvironment({ ...localEnv, VIP_TEST_DATABASE_URL: undefined }),
    ).toThrow();
    expect(() =>
      releaseTestEnvironment({
        ...localEnv,
        DATABASE_URL: 'postgresql://owner:secret@production.test/main',
      }),
    ).toThrow();
    expect(() =>
      releaseTestEnvironment({
        ...localEnv,
        DATABASE_URL: 'postgresql://tester@localhost/real_customers',
      }),
    ).toThrow();
  });
  it('publishes only a freshly built production context, without arbitrary overrides', () => {
    const args = productionDeployArgs(
      'a'.repeat(40),
      'postgresql://owner:secret@db.test/app',
    );
    expect(args.slice(0, 5)).toEqual([
      'deploy',
      '--prod',
      '--context',
      'production',
      '--skip-functions-cache',
    ]);
    expect(args).not.toContain('--no-build');
    expect(args).not.toContain('--alias');
    expect(args.filter((x) => x === '--secret-env')).toHaveLength(3);
    expect(args).toContain('--json');
    expect(redact(args.join(' '))).not.toContain('secret@');
    expect(
      redact('sk_live_abc rk_test_def whsec_ghi re_abcdef0123456789012345'),
    ).not.toMatch(/sk_live_|rk_test_|whsec_|re_abcdef/);
  });
  it('requires identical new Prisma/Netlify migrations and refuses modifications to applied SQL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rhyze-release-test-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'prisma/migrations/20260923000000_new'), {
      recursive: true,
    });
    mkdirSync(join(dir, 'netlify/database/migrations'), { recursive: true });
    writeFileSync(
      join(dir, 'prisma/migrations/20260923000000_new/migration.sql'),
      'SELECT 1;',
    );
    const changes = [
      'A\tprisma/migrations/20260923000000_new/migration.sql',
      'A\tnetlify/database/migrations/20260923000000_new.sql',
    ];
    expect(() => assertMigrationMirrors(dir, changes)).toThrow();
    writeFileSync(
      join(dir, 'netlify/database/migrations/20260923000000_new.sql'),
      'SELECT 2;',
    );
    expect(() => assertMigrationMirrors(dir, changes)).toThrow();
    writeFileSync(
      join(dir, 'netlify/database/migrations/20260923000000_new.sql'),
      'SELECT 1;',
    );
    expect(() => assertMigrationMirrors(dir, changes)).not.toThrow();
    expect(() =>
      assertMigrationMirrors(dir, ['M\tnetlify/database/migrations/old.sql']),
    ).toThrow();
  });
});

function fakeSteps(failAt?: string) {
  const calls: string[] = [];
  const names = [
    'prepare',
    'localChecks',
    'preflight',
    'snapshotCheck',
    'databaseBinding',
    'recheck',
    'deploy',
    'verify',
    'databaseLocked',
  ] as const;
  const steps = Object.fromEntries(
    names.map((name) => [
      name,
      async () => {
        calls.push(name);
        if (name === failAt) throw Error('simulated failure');
      },
    ]),
  ) as ReleaseSteps;
  return { calls, steps };
}
describe('release fail-closed orchestration', () => {
  it.each([
    'prepare',
    'localChecks',
    'preflight',
    'snapshotCheck',
    'databaseBinding',
    'recheck',
  ])('never publishes after %s fails', async (step) => {
    const { calls, steps } = fakeSteps(step);
    const report = await runRelease('publish', steps);
    expect(report.status).toBe('BLOCKED');
    expect(report.failedStep).toBe(step);
    expect(calls).not.toContain('deploy');
    expect(report.published).toBe(false);
  });
  it('check mode cannot publish or request a privileged database binding', async () => {
    const { calls, steps } = fakeSteps();
    expect((await runRelease('check', steps)).status).toBe(
      'CHECKED_NOT_DEPLOYED',
    );
    expect(calls).toEqual([
      'prepare',
      'localChecks',
      'preflight',
      'snapshotCheck',
    ]);
  });
  it.each(['deploy', 'verify', 'databaseLocked'])(
    'does not claim success or automatically roll back after %s fails',
    async (step) => {
      const { calls, steps } = fakeSteps(step);
      const report = await runRelease('publish', steps);
      expect(report.status).toBe('REQUIRES_ATTENTION');
      expect(report.failedStep).toBe(step);
      expect(report.publicationAttempted).toBe(true);
      expect(calls).not.toContain('rollback');
    },
  );
  it('reports verified only after live checks and database-access restoration pass', async () => {
    const { calls, steps } = fakeSteps();
    const report = await runRelease('publish', steps);
    expect(report.status).toBe('VERIFIED');
    expect(calls.slice(-4)).toEqual([
      'recheck',
      'deploy',
      'verify',
      'databaseLocked',
    ]);
    expect(SITE_ID).toBe(site.id);
  });
});
