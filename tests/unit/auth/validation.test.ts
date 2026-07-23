import { describe, expect, it } from 'vitest';
import {
  signInSchema,
  signUpSchema,
} from '@/lib/validation/auth';

describe('account validation', () => {
  it('normalizes valid sign-in input', () => {
    expect(
      signInSchema.parse({
        email: ' MEMBER@Example.com ',
        password: 'a-password',
      }),
    ).toEqual({
      email: 'member@example.com',
      password: 'a-password',
    });
  });

  it('requires matching passwords during signup', () => {
    const result = signUpSchema.safeParse({
      name: 'Maya Collins',
      email: 'maya@example.com',
      password: 'Rhyze!StrongPass2026',
      passwordConfirmation: 'different',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.passwordConfirmation).toContain(
        'Passwords must match.',
      );
    }
  });
});
