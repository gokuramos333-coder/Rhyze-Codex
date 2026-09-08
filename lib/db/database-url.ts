const LOCALHOST_DATABASE_PATTERN = /(?:localhost|127\.0\.0\.1):5432/;

export function resolveRuntimeDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const netlifyDatabaseUrl =
    env.NETLIFY_DB_URL ?? env.NETLIFY_DATABASE_URL ?? env.NETLIFY_DATABASE_URL_UNPOOLED;

  if (
    env.NODE_ENV === 'production' &&
    netlifyDatabaseUrl &&
    (!env.DATABASE_URL || LOCALHOST_DATABASE_PATTERN.test(env.DATABASE_URL))
  ) {
    env.DATABASE_URL = netlifyDatabaseUrl;
  }

  return env.DATABASE_URL;
}
