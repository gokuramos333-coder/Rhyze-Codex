import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('sign-in password visibility', () => {
  it('uses the accessible password field with the current-password autocomplete value', () => {
    const signIn = readFileSync('app/(auth)/sign-in/page.tsx', 'utf8');
    const field = readFileSync('components/domain/accounts/PasswordField.tsx', 'utf8');
    expect(signIn).toContain("import { PasswordField }");
    expect(signIn).toContain('autoComplete="current-password"');
    expect(field).toContain("shown ? 'text' : 'password'");
    expect(field).toContain('Show ${label.toLowerCase()}');
    expect(field).toContain('Hide ${label.toLowerCase()}');
  });
});
