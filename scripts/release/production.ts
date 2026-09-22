import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import {
  ACCOUNT_ID,
  CLI_VERSION,
  SITE_ID,
  assertApplicationDatabase,
  assertMigrationMirrors,
  assertProductionDeploy,
  assertProductionEnvironment,
  baseEnvironment,
  parseOptions,
  productionDeployArgs,
  redact,
  releaseTestEnvironment,
  type Deploy,
  type EnvVariable,
  type Site,
} from './guards';
import { verifyLiveHttp } from './http-smoke';
import { runRelease, type ReleaseReport, type ReleaseSteps } from './workflow';
const {
  assertIsolatedLocation,
  verifySnapshot,
  acquireReleaseLock,
} = require('./boundary.cjs');

const exec = promisify(execFile);
const digest = (contents: Buffer | string) =>
  createHash('sha256').update(contents).digest('hex');

function findCli() {
  const cache = join(homedir(), '.npm/_npx');
  const candidates = process.env.RHYZE_NETLIFY_CLI
    ? [process.env.RHYZE_NETLIFY_CLI]
    : existsSync(cache)
      ? readdirSync(cache).map((name) =>
          join(cache, name, 'node_modules/netlify-cli/bin/run.js'),
        )
      : [];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const pkg = JSON.parse(
      readFileSync(
        join(dirname(dirname(realpathSync(path))), 'package.json'),
        'utf8',
      ),
    );
    if (pkg.name === 'netlify-cli' && pkg.version === CLI_VERSION)
      return realpathSync(path);
  }
  throw Error(
    `Install the pinned CLI first: npm exec --yes --package=netlify-cli@${CLI_VERSION} -- netlify --version. No unpinned CLI fallback is allowed.`,
  );
}

async function main() {
  // Parse before credentials, network, filesystem writes or CLI discovery.
  const options = parseOptions(process.argv.slice(2));
  const root = realpathSync(process.cwd());
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
  if (realpathSync(git('rev-parse', '--show-toplevel')) !== root)
    throw Error('Run from the reviewed repository root.');
  const cli = findCli();
  const remoteEnv: NodeJS.ProcessEnv = {
    ...baseEnvironment(process.env),
    NODE_ENV: 'production',
    NETLIFY_SITE_ID: SITE_ID,
    NETLIFY_TELEMETRY_DISABLED: '1',
    NO_UPDATE_NOTIFIER: '1',
  };
  if (process.env.NETLIFY_AUTH_TOKEN)
    remoteEnv.NETLIFY_AUTH_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
  const run = async (
    bin: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    label: string,
    timeout = 120000,
  ) => {
    console.info(label);
    try {
      return (
        await exec(bin, args, {
          cwd,
          env,
          encoding: 'utf8',
          timeout,
          maxBuffer: 64 * 1024 * 1024,
        })
      ).stdout;
    } catch {
      throw Error(
        `${label} failed. No fallback or automatic retry; credentials/output withheld.`,
      );
    }
  };
  async function api<T>(
    operation: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    const output = await run(
      process.execPath,
      [cli, 'api', operation, '--data', JSON.stringify(data)],
      root,
      remoteEnv,
      `Netlify read-only ${operation}`,
      60000,
    );
    return JSON.parse(output) as T;
  }
  const production = async (expected: string) => {
    const site = await api<Site>('getSite', { site_id: SITE_ID });
    const deploy = await api<Deploy>('getDeploy', { deploy_id: expected });
    assertProductionDeploy(site, deploy, expected);
    return deploy;
  };
  const config = async (deploy: Deploy) => {
    const variables = await api<EnvVariable[]>('getEnvVars', {
      account_id: ACCOUNT_ID,
      site_id: SITE_ID,
    });
    assertProductionEnvironment(variables, deploy.created_at);
    // Persist only a fingerprint, never credentials (even masked API values).
    return digest(JSON.stringify(variables));
  };
  let artifact = '';
  let snapshot = '';
  let revision = '';
  let originalConfig = '';
  let publishedId = options.expectedDeploy;
  let databaseUrl = '';
  let hashes: [string, string][] = [];
  const evidence: Record<string, unknown> = {
    at: new Date().toISOString(),
    siteId: SITE_ID,
    expectedDeploy: options.expectedDeploy,
    mode: options.mode,
    cliVersion: CLI_VERSION,
  };
  function save(report: ReleaseReport) {
    if (artifact)
      writeFileSync(
        join(artifact, 'release.json'),
        JSON.stringify({ ...evidence, ...report }, null, 2),
        { mode: 0o600 },
      );
  }
  async function binding() {
    const result = await api<{
      connection_string?: string;
      result?: { connection_string?: string };
    }>('getSiteDatabase', { site_id: SITE_ID, role: 'netlifydb_owner' });
    return result.connection_string || result.result?.connection_string || '';
  }
  const steps: ReleaseSteps = {
    async prepare() {
      if (git('status', '--porcelain'))
        throw Error(
          'Reviewed source must be committed and clean. Preserve existing changes; never reset/clean to pass.',
        );
      revision = git('rev-parse', 'HEAD');
      git('merge-base', '--is-ancestor', options.baseRef!, revision);
      const current = await production(options.expectedDeploy);
      const base = git('rev-parse', options.baseRef!);
      if (
        !(
          current.commit_ref === base ||
          current.title?.includes(base) ||
          current.title?.startsWith(base.slice(0, 7) + ' ')
        )
      )
        throw Error(
          'The base commit is not identified by the published deploy. Review the release record first.',
        );
      releaseTestEnvironment(process.env); // Before installing or executing tests.
      mkdirSync(join(root, '.releases'), { recursive: true, mode: 0o700 });
      artifact = mkdtempSync(
        join(root, '.releases', revision.slice(0, 12) + '-'),
      );
      // Netlify CLI selects the uppermost ancestor package.json, even without
      // workspaces. NEVER put this snapshot beneath the original checkout.
      snapshot = realpathSync(
        mkdtempSync(join(tmpdir(), 'rhyze-release-source-')),
      );
      assertIsolatedLocation(snapshot);
      git(
        'archive',
        '--format=tar',
        '--output',
        join(artifact, 'source.tar'),
        revision,
      );
      git('bundle', 'create', join(artifact, 'history.bundle'), 'HEAD');
      git('bundle', 'verify', join(artifact, 'history.bundle'));
      execFileSync('tar', [
        '-xf',
        join(artifact, 'source.tar'),
        '-C',
        snapshot,
      ]);
      const names = git('ls-tree', '-r', '--name-only', revision).split('\n');
      hashes = names.map((name) => {
        if (
          /^(?:\.env(?:\.|$)|node_modules\/|\.netlify\/)/.test(name) &&
          name !== '.env.example'
        )
          throw Error(
            'Tracked local environment/build files are forbidden in a release snapshot.',
          );
        const file = join(snapshot, name);
        if (!lstatSync(file).isFile())
          throw Error('Release snapshot contains a non-regular tracked file.');
        return [name, digest(readFileSync(file))];
      });
      assertMigrationMirrors(
        snapshot,
        git(
          'diff',
          '--name-status',
          base,
          revision,
          '--',
          'prisma/migrations',
          'netlify/database/migrations',
        ).split('\n'),
      );
      Object.assign(evidence, {
        sourceCommit: revision,
        baseCommit: base,
        archiveSha256: digest(readFileSync(join(artifact, 'source.tar'))),
        bundleSha256: digest(readFileSync(join(artifact, 'history.bundle'))),
        trackedFiles: names.length,
        snapshotPath: snapshot,
      });
    },
    async localChecks() {
      const env = releaseTestEnvironment(process.env);
      await run(
        'npm',
        ['ci', '--no-audit', '--no-fund'],
        snapshot,
        env,
        'Install locked release dependencies',
        300000,
      );
      await run(
        'npm',
        ['run', 'prisma:generate'],
        snapshot,
        env,
        'Generate Prisma client',
      );
      await run(
        'npm',
        ['run', 'prisma:validate'],
        snapshot,
        env,
        'Validate Prisma schema',
      );
      const resultsFile = join(artifact, 'tests.json');
      await run(
        'npm',
        [
          'test',
          '--',
          '--reporter=dot',
          '--reporter=json',
          `--outputFile=${resultsFile}`,
        ],
        snapshot,
        env,
        'Run full tests including required PostgreSQL integration suites',
        300000,
      );
      const results = JSON.parse(readFileSync(resultsFile, 'utf8'));
      if (
        !results.success ||
        !results.numTotalTests ||
        results.numFailedTests ||
        results.numPendingTests ||
        results.numFailedTestSuites
      )
        throw Error('Tests failed or skipped; publication blocked.');
      for (const name of [
        'callback-requests',
        'account-identity',
        'member-attribution',
        'native-vip-ordering',
        'membership-plan-changes',
      ]) {
        if (
          !results.testResults.some(
            (item: { name: string; status: string }) =>
              item.name.endsWith(`/tests/integration/${name}.test.ts`) &&
              item.status === 'passed',
          )
        )
          throw Error(`Required ${name} integration suite did not pass.`);
      }
      evidence.tests = {
        files: results.testResults.length,
        tests: results.numTotalTests,
        failed: results.numFailedTests,
        skipped: results.numPendingTests,
      };
      await run(
        'npm',
        ['run', 'typecheck'],
        snapshot,
        env,
        'Typecheck reviewed source',
      );
      await run('npm', ['run', 'lint'], snapshot, env, 'Lint reviewed source');
      await run(
        'npm',
        ['run', 'build'],
        snapshot,
        { ...env, NODE_ENV: 'production' },
        'Build isolated production output',
        300000,
      );
    },
    async preflight() {
      const current = await production(options.expectedDeploy);
      originalConfig = await config(current);
      evidence.before = await verifyLiveHttp();
      await run(
        process.execPath,
        [cli, 'link', '--id', SITE_ID],
        snapshot,
        remoteEnv,
        'Link only the existing production project',
      );
      if (
        JSON.parse(readFileSync(join(snapshot, '.netlify/state.json'), 'utf8'))
          .siteId !== SITE_ID
      )
        throw Error('Isolated snapshot linked to the wrong site.');
      const status = JSON.parse(
        await run(
          process.execPath,
          [cli, 'status', '--json'],
          snapshot,
          remoteEnv,
          'Resolve linked Netlify project',
        ),
      );
      if (
        !status.loggedIn ||
        !status.linked ||
        status.siteData?.['site-id'] !== SITE_ID ||
        realpathSync(status.siteData?.['config-path']) !==
          join(snapshot, 'netlify.toml')
      )
        throw Error(
          'CLI did not resolve the expected online production project.',
        );
      await run(
        process.execPath,
        [cli, 'build', '--dry', '--context', 'production'],
        snapshot,
        remoteEnv,
        'Validate full Netlify production build configuration',
      );
    },
    async snapshotCheck() {
      if (git('rev-parse', 'HEAD') !== revision || git('status', '--porcelain'))
        throw Error('Source changed during release checks.');
      verifySnapshot(snapshot, hashes);
      if (lstatSync(join(snapshot, 'node_modules')).isSymbolicLink())
        throw Error('Release requires its own installed dependencies.');
      if (
        readdirSync(snapshot).some(
          (name) => /^\.env(?:\.|$)/.test(name) && name !== '.env.example',
        )
      )
        throw Error('Local environment file appeared in release snapshot.');
    },
    async databaseBinding() {
      // This does NOT grant permission. An operator must explicitly authorize and
      // temporarily enable it for this release, then restore OFF immediately.
      databaseUrl = await binding();
      assertApplicationDatabase(databaseUrl);
      const require = createRequire(join(snapshot, 'package.json'));
      const { PrismaClient } =
        require('@prisma/client') as typeof import('@prisma/client');
      const db = new PrismaClient({ datasourceUrl: databaseUrl });
      try {
        await db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          for (const table of ['User', 'Purchase', 'Booking', 'StripeEvent']) {
            // PostgreSQL's comma-separated privilege syntax means ANY, not ALL.
            for (const permission of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
              const privileges = await tx.$queryRaw<
                { allowed: boolean }[]
              >`SELECT has_table_privilege(current_user, ${`public."${table}"`}, ${permission}) AS allowed`;
              if (!privileges[0]?.allowed)
                throw Error(
                  'Production application binding lacks required table privileges.',
                );
            }
          }
          evidence.databasePrivileges = 'verified by read-only transaction';
        });
      } finally {
        await db.$disconnect();
      }
    },
    async recheck() {
      await steps.snapshotCheck();
      if (
        (await config(await production(options.expectedDeploy))) !==
        originalConfig
      )
        throw Error('Production settings changed during checks.');
      writeFileSync(
        join(artifact, 'boundary-manifest.json'),
        JSON.stringify({
          root: snapshot,
          hashes,
          siteId: SITE_ID,
          accountId: ACCOUNT_ID,
          expectedDeploy: options.expectedDeploy,
          configHash: originalConfig,
          revision,
          boundaryReceipt: join(artifact, 'boundary-receipt.json'),
        }),
        { mode: 0o600 },
      );
    },
    async deploy() {
      const env = {
        ...remoteEnv,
        RHYZE_RELEASE_MANIFEST: join(artifact, 'boundary-manifest.json'),
        RHYZE_RELEASE_NETLIFY_CLI: cli,
        DATABASE_URL: databaseUrl,
        NETLIFY_DB_URL: databaseUrl,
        NETLIFY_DATABASE_URL: databaseUrl,
      };
      console.info(
        'Publication begins. Restore PAT database access OFF immediately afterward, even if publication fails.',
      );
      const output = await run(
        process.execPath,
        [cli, ...productionDeployArgs(revision, databaseUrl)],
        snapshot,
        env,
        'Full Netlify production build and publication',
        600000,
      );
      databaseUrl = '';
      // CLI JSON is captured, never logged: it can include sensitive diagnostics.
      const result = JSON.parse(output) as { deploy_id?: string };
      if (!result.deploy_id)
        throw Error(
          'Publication result uncertain; inspect Netlify before any retry.',
        );
      publishedId = result.deploy_id;
      evidence.deployId = publishedId;
      const boundary = JSON.parse(
        readFileSync(join(artifact, 'boundary-receipt.json'), 'utf8'),
      );
      if (!boundary.passed || boundary.sourceCommit !== revision)
        throw Error(
          'Final build-boundary evidence missing. Inspect the published deploy before retrying.',
        );
      evidence.boundary = boundary;
    },
    async verify() {
      const deploy = await production(publishedId);
      if (options.mode === 'publish' && !deploy.title?.includes(revision))
        throw Error('Published source identity does not match this release.');
      evidence.after = await verifyLiveHttp();
      // Check again after HTTP verification to catch a concurrent publication.
      await production(publishedId);
      evidence.deployId = publishedId;
    },
    async databaseLocked() {
      const value = await binding();
      try {
        if (!/readonly/i.test(new URL(value).username)) throw Error();
      } catch {
        throw Error(
          'Restore production PAT database access OFF, then run release:verify. Release remains REQUIRES_ATTENTION.',
        );
      }
      evidence.databaseAccessRestored = true;
    },
  };
  // Verification receipts are also preserved without archiving/rebuilding source.
  if (options.mode === 'verify') {
    mkdirSync(join(root, '.releases'), { recursive: true, mode: 0o700 });
    artifact = mkdtempSync(join(root, '.releases', 'verify-'));
  }
  let failure = '';
  const wrapped = Object.fromEntries(
    Object.entries(steps).map(([name, step]) => [
      name,
      async () => {
        console.info(`Release step: ${name}`);
        try {
          await step();
        } catch (error) {
          failure = redact(
            error instanceof Error ? error.message : 'Step failed',
          );
          evidence.failureReason = failure;
          throw error;
        }
      },
    ]),
  ) as ReleaseSteps;
  const unlock =
    options.mode === 'verify'
      ? () => {}
      : acquireReleaseLock(
          join(homedir(), '.cache/rhyze-releases', SITE_ID + '.lock'),
        );
  let report: ReleaseReport;
  try {
    report = await runRelease(options.mode, wrapped, save);
  } finally {
    unlock();
  }
  console.info(
    JSON.stringify(
      { ...report, artifact: artifact || null, reason: failure || undefined },
      null,
      2,
    ),
  );
  if (options.mode === 'publish')
    console.info(
      'Verify PAT database access is OFF; this tool never enables it or rolls back data.',
    );
  if (report.status === 'BLOCKED' || report.status === 'REQUIRES_ATTENTION')
    process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    redact(error instanceof Error ? error.message : 'Release failed'),
  );
  process.exitCode = 1;
});
