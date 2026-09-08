import { describe, expect, it } from 'vitest';

import { resolveDatabaseUrl } from '@/lib/db/database-url';

describe('resolveDatabaseUrl', () => {
  it('prefers the Netlify runtime database URL over a packaged local URL', () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: 'postgresql://localhost/rhyze',
        NETLIFY_DB_URL: 'postgresql://production/rhyze',
      }),
    ).toBe('postgresql://production/rhyze');
  });

  it('falls back to DATABASE_URL for local development', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: 'postgresql://localhost/rhyze' })).toBe(
      'postgresql://localhost/rhyze',
    );
  });
});
