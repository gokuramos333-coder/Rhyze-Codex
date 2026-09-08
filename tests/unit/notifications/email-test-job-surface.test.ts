import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('protected activation email test job', () => {
  const source = readFileSync('app/api/jobs/email-test/route.ts', 'utf8');

  it('requires the job secret and only renders the account activation sample', () => {
    expect(source).toContain('authorization !== `Bearer ${process.env.JOB_SECRET}`');
    expect(source).toContain("const template = 'ACCOUNT_ACTIVATION' as const");
    expect(source).toContain('sampleEmailInput(template)');
    expect(source).toContain('`[TEST] ${rendered.subject}`');
  });
});
