import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
describe('admin renewal feedback', () => {
  it('explains ambiguity, required waiver, and explicit recovery without implying a credit was spent', () => {
    const page = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/roster/page.tsx', 'utf8');
    for (const key of ['member-ambiguous', 'member-waiver', 'member-renewal-recovery']) expect(page).toContain(`'${key}':`);
    expect(page).toContain('pending renewal');
  });
});
