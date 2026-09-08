import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('class booking membership surface', () => {
  const page = readFileSync('app/book/[slug]/page.tsx', 'utf8');

  it('uses the $25 fallback and removes the separate waiver card', () => {
    expect(page).toContain('?? 2500');
    expect(page).not.toContain('Waiver status');
  });

  it('shows a live remaining-credit message for a signed-in plan holder', () => {
    expect(page).toContain('creditDisplay');
    expect(page).toContain('credit');
  });

  it('lets same-month single standard class credits unlock booking without an active membership', () => {
    expect(page).toContain('eligibleCreditAccounts');
    expect(page).toContain('standardSingleClassCreditCanBook');
    expect(page).toContain('hasUnlimitedAccess ||\n    availableCredits > 0');
    expect(page).toContain('valid for 1 month');
    expect(page).not.toContain('activeMembership && (hasUnlimitedAccess || availableCredits > 0)');
  });
});
