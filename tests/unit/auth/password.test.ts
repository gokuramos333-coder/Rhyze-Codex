import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from '@/lib/auth/password';

describe('password security', () => {
  it('hashes a password without retaining the plain text', async () => {
    const password = 'Rhyze!StrongPass2026';
    const hash = await hashPassword(password);

    expect(hash).not.toContain(password);
    expect(await verifyPassword(hash, password)).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  });

  it('rejects weak passwords with specific validation errors', () => {
    expect(validatePassword('short')).toEqual({
      valid: false,
      errors: [
        'Use at least 9 characters.',
        'Include an uppercase letter.',
        'Include a number.',
        'Include a symbol.',
      ],
    });
  });

  it('accepts a strong password', () => {
    expect(validatePassword('Rhyze26!A')).toEqual({
      valid: true,
      errors: [],
    });
  });
});
