import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ADMIN create client surface', () => {
  it('links Create client beside Export clients', () => {
    const source = readFileSync('app/(studio)/admin/members/page.tsx', 'utf8');
    expect(source).toContain('href="/admin/members/new"');
    expect(source).toContain('Create Client');
    expect(source.indexOf('Create Client')).toBeLessThan(source.indexOf('Export Clients'));
  });

  it('collects public-signup identity fields without password or waiver fields', () => {
    const page = readFileSync('app/(studio)/admin/members/new/page.tsx', 'utf8');
    const actions = readFileSync('app/(studio)/admin/members/new/actions.ts', 'utf8');
    expect(page).toContain('name="firstName"');
    expect(page).toContain('name="lastName"');
    expect(page).toContain('name="email"');
    expect(page).toContain('name="phone"');
    expect(page).toContain('<BirthdayFields');
    expect(page).not.toContain('name="password"');
    expect(page).not.toContain('name="waiverAccepted"');
    expect(page).toContain('Purchase through Stripe');
    expect(page).toContain('Assign without charging');
    expect(actions).toContain('requireApprovedOwner()');
    expect(actions).toContain('createAdminClient');
  });
});
