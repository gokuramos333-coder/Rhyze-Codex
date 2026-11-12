import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('guards server identity in beforeAll before any fixture test can write', () => {
  const source = readFileSync('tests/integration/admin-renewal-followup.test.ts', 'utf8');
  const hook = source.match(/beforeAll\(async \(\) => \{([\s\S]*?)\n  \}\);/);
  expect(hook, 'identity must be a suite setup gate, not an ordinary test').not.toBeNull();
  expect(hook![1]).toContain('assertAdminRenewalTestDatabaseIdentity');
  expect(hook![1]).toContain("current_setting('data_directory')");
  expect(hook![1]).not.toContain('fixture()');
});
