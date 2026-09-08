type DatabaseEnvironment = {
  DATABASE_URL?: string;
  NETLIFY_DB_URL?: string;
  NETLIFY_DATABASE_URL?: string;
};

export function resolveDatabaseUrl(env: DatabaseEnvironment): string | undefined {
  return env.NETLIFY_DB_URL ?? env.NETLIFY_DATABASE_URL ?? env.DATABASE_URL;
}
