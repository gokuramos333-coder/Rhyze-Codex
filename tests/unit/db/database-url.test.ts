import { describe, expect, it } from 'vitest';

import { resolveRuntimeDatabaseUrl } from '@/lib/db/database-url';

describe('resolveRuntimeDatabaseUrl', () => {
  it('prefers Netlify managed database URL over bundled localhost in production', () => {
    const env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/rhyze',
      NETLIFY_DB_URL: 'postgresql://prod:pass@netlify.example.com:5432/rhyze',
    } as NodeJS.ProcessEnv;

    expect(resolveRuntimeDatabaseUrl(env)).toBe(env.NETLIFY_DB_URL);
    expect(env.DATABASE_URL).toBe(env.NETLIFY_DB_URL);
  });

  it('keeps explicit non-local DATABASE_URL values', () => {
    const env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod:pass@db.example.com:5432/rhyze',
      NETLIFY_DB_URL: 'postgresql://other:pass@netlify.example.com:5432/rhyze',
    } as NodeJS.ProcessEnv;

    expect(resolveRuntimeDatabaseUrl(env)).toBe('postgresql://prod:pass@db.example.com:5432/rhyze');
  });
});
