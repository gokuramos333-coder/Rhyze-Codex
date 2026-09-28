import { execFile, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import {
  ACCOUNT_ID,
  CLI_VERSION,
  SITE_ID,
  SITE_NAME,
  parseOptions,
  assertProductionDeploy,
  assertProductionEnvironment,
  type Site,
  type Deploy,
  type EnvVariable,
} from './guards';
import { verifyLiveHttp } from './http-smoke';
const {
  acquireReleaseLock,
  environmentFingerprint,
} = require('./boundary.cjs');
const {
  BRANCH,
  APPROVAL_KEY,
  assertHostedCandidate,
  assertHostedReceipt,
  databaseIdentity,
} = require('./hosted-guard.cjs');
const { runHostedWorkflow } = require('./hosted-workflow.cjs');
const { requestNetlify } = require('./hosted-api.cjs');
const REPO = 'gokuramos333-coder/Rhyze-Codex';
type HostedSite = Site & {
  build_settings?: {
    repo_path?: string;
    repo_branch?: string;
    provider?: string;
    stop_builds?: boolean;
  };
  published_deploy?: { id: string; locked?: boolean };
};
type HostedDeploy = Deploy & {
  build_id?: string;
  branch?: string;
  locked?: boolean;
  deploy_ssl_url?: string;
  draft?: boolean;
};
async function main() {
  const options = parseOptions(['publish', ...process.argv.slice(2)]);
  const root = realpathSync(process.cwd());
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  if (
    realpathSync(git('rev-parse', '--show-toplevel')) !== root ||
    git('status', '--porcelain')
  )
    throw Error('Run from clean, committed reviewed source.');
  const revision = git('rev-parse', 'HEAD');
  git('merge-base', '--is-ancestor', options.baseRef!, revision);
  if (
    ![`https://github.com/${REPO}.git`, `git@github.com:${REPO}.git`].includes(
      git('remote', 'get-url', 'origin'),
    )
  )
    throw Error('Unexpected Git remote.');
  const candidates = process.env.RHYZE_NETLIFY_CLI
    ? [process.env.RHYZE_NETLIFY_CLI]
    : readdirSync(join(homedir(), '.npm/_npx')).map((name) =>
        join(
          homedir(),
          '.npm/_npx',
          name,
          'node_modules/netlify-cli/bin/run.js',
        ),
      );
  const cli = candidates.find(
    (file) =>
      existsSync(file) &&
      JSON.parse(
        readFileSync(
          join(dirname(dirname(realpathSync(file))), 'package.json'),
          'utf8',
        ),
      ).version === CLI_VERSION,
  );
  if (!cli) throw Error('Pinned Netlify CLI required.');
  const { getToken } = await import(
    pathToFileURL(join(dirname(dirname(cli)), 'dist/utils/command-helpers.js'))
      .href
  );
  const [token] = await getToken();
  async function api<T>(
    operation: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    return requestNetlify(operation, data, token) as Promise<T>;
  }
  const site = () => api<HostedSite>('getSite', { site_id: SITE_ID });
  const deploy = (id: string) =>
    api<HostedDeploy>('getDeploy', { deploy_id: id });
  const variables = () =>
    api<EnvVariable[]>('getEnvVars', {
      account_id: ACCOUNT_ID,
      site_id: SITE_ID,
    });
  const fingerprint = (vars: EnvVariable[]) =>
    environmentFingerprint(vars.filter((item) => item.key !== APPROVAL_KEY));
  async function locked(expected: string) {
    const [s, d] = await Promise.all([site(), deploy(expected)]);
    assertProductionDeploy(s, d, expected);
    if (
      s.build_settings?.provider !== 'github' ||
      s.build_settings.repo_path !== REPO ||
      s.build_settings.repo_branch !== BRANCH ||
      s.build_settings.stop_builds ||
      d.locked !== true
    )
      throw Error(
        'Connect the reviewed repository/production branch, enable builds and lock automatic publication first.',
      );
    return d;
  }
  async function patOff() {
    const result = await api<{
      connection_string?: string;
      result?: { connection_string?: string };
    }>('getSiteDatabase', { site_id: SITE_ID, role: 'netlifydb_owner' });
    const value =
      result.connection_string || result.result?.connection_string || '';
    if (!/readonly/i.test(new URL(value).username))
      throw Error('PAT production database access must remain OFF.');
    return databaseIdentity(value) as string;
  }
  const current = await locked(options.expectedDeploy);
  const base = git('rev-parse', options.baseRef!);
  if (current.commit_ref !== base && !current.title?.includes(base))
    throw Error('Live source does not match the supplied base.');
  const initialVars = await variables();
  if (initialVars.some((item) => item.key === APPROVAL_KEY))
    throw Error('An existing hosted approval requires reconciliation first.');
  assertProductionEnvironment(initialVars, current.created_at);
  const configHash = fingerprint(initialVars);
  const databaseId = await patOff();
  console.info(
    'Run complete isolated release checks before authorizing a hosted build.',
  );
  // Existing command runs full tests, disposable DB suites, lint, typecheck,
  // Prisma validation and isolated build. No hosted approval exists yet.
  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [
        join(root, 'node_modules/tsx/dist/cli.mjs'),
        join(root, 'scripts/release/production.ts'),
        'check',
        '--expected-deploy',
        options.expectedDeploy,
        '--base-ref',
        base,
      ],
      {
        cwd: root,
        env: process.env,
        timeout: 1200000,
        maxBuffer: 32 * 1024 * 1024,
      },
      (error) =>
        error
          ? reject(
              Error('Full release check failed. No hosted build authorized.'),
            )
          : resolve(),
    );
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
  const unlock = acquireReleaseLock(
    join(homedir(), '.cache/rhyze-releases', SITE_ID + '.lock'),
  );
  mkdirSync(join(root, '.releases'), { recursive: true, mode: 0o700 });
  const artifact = mkdtempSync(join(root, '.releases', 'hosted-'));
  const evidence: Record<string, unknown> = {
    revision,
    base,
    expectedDeploy: options.expectedDeploy,
    configHash,
    status: 'BLOCKED',
    at: new Date().toISOString(),
  };
  const save = () =>
    writeFileSync(
      join(artifact, 'release.json'),
      JSON.stringify(evidence, null, 2),
      { mode: 0o600 },
    );
  let approvalMayExist = false;
  let candidateId = '';

  async function unchanged() {
    if (git('rev-parse', 'HEAD') !== revision || git('status', '--porcelain'))
      throw Error('Local reviewed source changed.');
    await locked(options.expectedDeploy);
    const vars = await variables();
    if (fingerprint(vars) !== configHash)
      throw Error('Production configuration changed during release.');
    assertProductionEnvironment(vars, current.created_at);
  }
  try {
    const result = await runHostedWorkflow(
      {
        async prepare() {
          await unchanged();
          const remote = git(
            'ls-remote',
            'origin',
            `refs/heads/${BRANCH}`,
          ).split(/\s/)[0];
          if (remote) git('merge-base', '--is-ancestor', remote, revision);
          // A leased push cannot overwrite newer work. The production lock and absent
          // approval also prevent the push-triggered build from publishing anything.
          git(
            'push',
            `--force-with-lease=refs/heads/${BRANCH}:${remote}`,
            'origin',
            `${revision}:refs/heads/${BRANCH}`,
          );
          await unchanged();
          const approval = {
            databaseIdentity: databaseId,
            version: 1,
            revision,
            nonce: randomBytes(24).toString('hex'),
            expiresAt: Date.now() + 60 * 60 * 1000,
          };
          approvalMayExist = true;
          await api('createEnvVars', {
            account_id: ACCOUNT_ID,
            site_id: SITE_ID,
            body: [
              {
                key: APPROVAL_KEY,
                scopes: ['builds'],
                values: [
                  { context: 'production', value: JSON.stringify(approval) },
                ],
              },
            ],
          });
          const build = await api<{ id: string; deploy_id: string }>(
            'createSiteBuild',
            {
              site_id: SITE_ID,
              branch: BRANCH,
              title: `Rhyze verified hosted release ${revision}`,
            },
          );
          if (!build.id || !build.deploy_id)
            throw Error(
              'Hosted build identity unavailable; inspect provider before retrying.',
            );
          candidateId = build.deploy_id;
          Object.assign(evidence, {
            buildId: build.id,
            deployId: candidateId,
            status: 'BUILDING',
          });
          save();
          console.info(
            `Hosted production build started: ${build.id}. Automatic publication remains locked.`,
          );
          let candidate: HostedDeploy | undefined;
          for (let i = 0; i < 120; i++) {
            const d = await deploy(candidateId);
            if (d.state === 'ready') {
              candidate = d;
              break;
            }
            if (['error', 'rejected', 'skipped', 'canceled'].includes(d.state))
              throw Error('Hosted build did not complete successfully.');
            await new Promise((resolve) => setTimeout(resolve, 10000));
          }
          if (!candidate)
            throw Error(
              'Hosted build timed out; do not retry without inspecting provider state.',
            );
          assertHostedCandidate(candidate, {
            revision,
            buildId: build.id,
            deployId: candidateId,
          });
          const origin = `https://${candidateId}--${SITE_NAME}.netlify.app`;
          if (candidate.deploy_ssl_url !== origin)
            throw Error('Unexpected immutable deploy URL.');
          const response = await fetch(`${origin}/_rhyze-release.json`, {
            redirect: 'error',
            cache: 'no-store',
            signal: AbortSignal.timeout(30000),
          });
          if (!response.ok) throw Error('Hosted build receipt unavailable.');
          const receipt = await response.json();
          assertHostedReceipt(receipt, approval);
          evidence.hostedReceipt = receipt;
          if ((await patOff()) !== databaseId)
            throw Error('Site database identity changed.');
          await unchanged();
          assertHostedCandidate(await deploy(candidateId), {
            revision,
            buildId: build.id,
            deployId: candidateId,
          });
        },
        async publish() {
          evidence.status = 'PUBLISHING';
          save();
          // This is a READY production-context Git build, never a preview promotion.
          await api('restoreSiteDeploy', {
            site_id: SITE_ID,
            deploy_id: candidateId,
          });
        },
        async lock() {
          await api('lockDeploy', { deploy_id: candidateId });
        },
        async verify() {
          await locked(candidateId);
          evidence.after = await verifyLiveHttp();
          await locked(candidateId);
          await patOff();
        },
        async removeApproval() {
          if (approvalMayExist)
            await api('deleteEnvVar', {
              account_id: ACCOUNT_ID,
              site_id: SITE_ID,
              key: APPROVAL_KEY,
            });
          if ((await variables()).some((item) => item.key === APPROVAL_KEY))
            throw Error('Hosted approval cleanup was not confirmed.');
          evidence.approvalRemoved = true;
        },
        async ensureLocked() {
          const s = await site();
          const published = s.published_deploy?.id;
          if (published !== options.expectedDeploy && published !== candidateId)
            throw Error();
          const d = await deploy(published!);
          if (!d.locked) await api('lockDeploy', { deploy_id: published });
          if (!(await deploy(published!)).locked) throw Error();
          evidence.autoPublishingLocked = true;
        },
        async patOff() {
          await patOff();
          evidence.patDatabaseAccessOff = true;
        },
      },
      (result: Record<string, unknown>) => {
        Object.assign(evidence, result);
        save();
      },
    );
    Object.assign(evidence, result);
    if (result.status !== 'VERIFIED') process.exitCode = 1;
    console.info(
      `Hosted release status: ${result.status}; failed steps: ${result.failures.join(', ') || 'none'}.`,
    );
  } finally {
    save();
    unlock();
    console.info(`Release receipt: ${join(artifact, 'release.json')}`);
  }
}
main().catch(() => {
  console.error(
    'Hosted release preflight failed; reviewed release inputs --expected-deploy and --base-ref are required. No fallback or automatic retry. Sensitive details withheld.',
  );
  process.exitCode = 1;
});
