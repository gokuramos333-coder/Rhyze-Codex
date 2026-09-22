import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SITE_ID = 'e7002b82-50f2-4760-8a35-e4f9591bec4f';
export const SITE_NAME = 'rhyze-fitness-rhyze-2';
export const ACCOUNT_ID = '69f4526a0c4cac514e1ada7f';
export const ORIGIN = 'https://www.rhyzefitness.com';
export const CLI_VERSION = '27.8.0';
export type Mode = 'check' | 'publish' | 'verify';
export type Deploy = {
  id: string;
  site_id: string;
  state: string;
  context: string;
  created_at: string;
  title?: string;
  commit_ref?: string | null;
  error_message?: string;
};
export type Site = {
  id: string;
  name: string;
  ssl_url: string;
  published_deploy?: { id: string };
};
export type EnvVariable = {
  key: string;
  scopes: string[];
  updated_at: string;
  values: { context: string; value?: string; role?: string }[];
};

export function parseOptions(args: string[]) {
  const [mode, ...rest] = args;
  if (!['check', 'publish', 'verify'].includes(mode))
    throw Error(
      'Use check, publish, or verify with --expected-deploy and --base-ref release inputs.',
    );
  const values: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (
      !['--expected-deploy', '--base-ref'].includes(key) ||
      !value ||
      value.startsWith('-') ||
      values[key]
    )
      throw Error(
        'Invalid release inputs; bypass/Netlify flags are not accepted.',
      );
    values[key] = value;
  }
  if (!/^[a-zA-Z0-9-]+$/.test(values['--expected-deploy'] || ''))
    throw Error('--expected-deploy is required.');
  if (mode !== 'verify' && !/^[a-f0-9]{7,40}$/.test(values['--base-ref'] || ''))
    throw Error(
      '--base-ref must identify the currently deployed source commit.',
    );
  return {
    mode: mode as Mode,
    expectedDeploy: values['--expected-deploy'],
    baseRef: values['--base-ref'],
  };
}

export function assertProductionDeploy(
  site: Site,
  deploy: Deploy,
  expected: string,
) {
  if (
    site.id !== SITE_ID ||
    site.name !== SITE_NAME ||
    site.ssl_url !== ORIGIN ||
    site.published_deploy?.id !== expected ||
    deploy.id !== expected ||
    deploy.site_id !== SITE_ID ||
    deploy.state !== 'ready' ||
    deploy.context !== 'production' ||
    deploy.error_message
  ) {
    throw Error(
      'Production identity/context changed or is not READY. Stop and reconcile; never promote a preview.',
    );
  }
}

export function assertProductionEnvironment(
  variables: EnvVariable[],
  deployedAt: string,
) {
  let credentialsMasked = false;
  if (!Number.isFinite(Date.parse(deployedAt)))
    throw Error('Missing production creation timestamp.');
  for (const key of [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_APP_URL',
  ]) {
    const variable = variables.find((item) => item.key === key);
    const values = variable?.values.filter(
      (value) => value.context === 'production',
    );
    const value = values?.[0]?.value;
    if (
      !variable ||
      values?.length !== 1 ||
      !value ||
      !variable.scopes.includes('functions') ||
      !variable.scopes.includes('builds')
    )
      throw Error(`Production ${key} is missing or scoped incorrectly.`);
    // Masked API values cannot establish key mode. Require unchanged production
    // settings PLUS authenticated LIVE runtime verification before release.
    if (
      !Number.isFinite(Date.parse(variable.updated_at)) ||
      Date.parse(variable.updated_at) > Date.parse(deployedAt)
    )
      throw Error(
        `Production ${key} changed since the published build; review configuration separately before releasing.`,
      );
    const masked = /\*{3}|MASKED|REDACTED/i.test(value);
    if (key === 'NEXT_PUBLIC_APP_URL' && value.replace(/\/$/, '') !== ORIGIN)
      throw Error('Production application URL does not match the live site.');
    if (key === 'STRIPE_SECRET_KEY' && !masked && !/^(sk|rk)_live_/.test(value))
      throw Error('Production requires LIVE Stripe credentials.');
    if (
      key === 'STRIPE_WEBHOOK_SECRET' &&
      !masked &&
      !value.startsWith('whsec_')
    )
      throw Error('Invalid production webhook configuration.');
    credentialsMasked ||= masked;
  }
  return { credentialsMasked };
}

export function assertApplicationDatabase(value: string) {
  try {
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      !url.password ||
      /readonly/i.test(url.username) ||
      /\*{3}|MASKED|REDACTED/i.test(value)
    )
      throw Error();
  } catch {
    throw Error(
      'Production application database binding is missing, masked, or read-only. No deployment permitted.',
    );
  }
}

export function baseEnvironment(source: Record<string, string | undefined>) {
  return Object.fromEntries(
    ['PATH', 'HOME', 'USER', 'TMPDIR', 'LANG'].flatMap((key) =>
      source[key] ? [[key, source[key]!]] : [],
    ),
  );
}

export function releaseTestEnvironment(
  source: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnvironment(source),
    NODE_ENV: 'test',
    EMAIL_DELIVERY_ENABLED: 'false',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  const databases: Record<string, string[]> = {
    DATABASE_URL: [
      'callback_test',
      'identity_migration',
      'membership_plan_test',
    ],
    CALLBACK_TEST_DATABASE_URL: ['callback_test'],
    IDENTITY_TEST_DATABASE_URL: ['identity_migration'],
    VIP_TEST_DATABASE_URL: ['identity_migration'],
    PLAN_CHANGE_TEST_DATABASE_URL: ['membership_plan_test'],
  };
  for (const [key, names] of Object.entries(databases)) {
    try {
      const value = source[key]!;
      const url = new URL(value);
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        !names.includes(url.pathname.slice(1)) ||
        url.search ||
        url.hash
      )
        throw Error();
      env[key] = value;
    } catch {
      throw Error(
        `Set ${key} to its explicit disposable local test database; integration suites must not be skipped.`,
      );
    }
  }
  return env;
}

export function assertMigrationMirrors(root: string, changes: string[]) {
  for (const entry of changes.filter(Boolean)) {
    const [status, path] = entry.split('\t');
    if (!path.endsWith('.sql')) continue;
    if (status !== 'A')
      throw Error(
        'Previously deployed SQL was modified/removed; stop for migration review.',
      );
    const name = path.startsWith('prisma/migrations/')
      ? path.split('/')[2]
      : path.split('/').at(-1)!.slice(0, -4);
    try {
      const prisma = readFileSync(
        join(root, 'prisma/migrations', name, 'migration.sql'),
      );
      const netlify = readFileSync(
        join(root, 'netlify/database/migrations', `${name}.sql`),
      );
      if (!prisma.equals(netlify)) throw Error();
    } catch {
      throw Error(
        `New migration ${name} requires identical Prisma and Netlify SQL mirrors.`,
      );
    }
  }
}

export function productionDeployArgs(revision: string, databaseUrl: string) {
  assertApplicationDatabase(databaseUrl);
  if (!/^[a-f0-9]{40}$/.test(revision))
    throw Error('Release must pin a full source commit.');
  const args = [
    'deploy',
    '--prod',
    '--context',
    'production',
    '--skip-functions-cache',
    '--message',
    `Rhyze verified release ${revision}`,
    '--json',
  ];
  for (const key of ['NETLIFY_DB_URL', 'NETLIFY_DATABASE_URL', 'DATABASE_URL'])
    args.push('--secret-env', `${key}=${databaseUrl}`);
  return args;
}

export function redact(text: string) {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[database withheld]')
    .replace(
      /\b(?:sk|rk)_(?:live|test)_[a-zA-Z0-9_]+|\bwhsec_[a-zA-Z0-9_]+|\bre_[a-zA-Z0-9_]{16,}/g,
      '[secret withheld]',
    );
}
