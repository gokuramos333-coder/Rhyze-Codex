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
      phone: '(973) 555-0101',
      referralCode: '',
      instructorCode: '',
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

  it('normalizes phone and optional codes during signup', () => {
    expect(
      signUpSchema.parse({
        name: '  Maya Collins  ',
        email: ' MAYA@EXAMPLE.COM ',
        phone: '(973) 555-0101',
        referralCode: ' triciarz26 ',
        instructorCode: '',
        password: 'Rhyze26!A',
        passwordConfirmation: 'Rhyze26!A',
      }),
    ).toMatchObject({
      name: 'Maya Collins',
      email: 'maya@example.com',
      phone: '(973) 555-0101',
      referralCode: 'TRICIARZ26',
      instructorCode: '',
    });
  });

  it('requires a phone number during signup', () => {
    const result = signUpSchema.safeParse({
      name: 'Maya Collins',
      email: 'maya@example.com',
      phone: '',
      password: 'Rhyze26!A',
      passwordConfirmation: 'Rhyze26!A',
    });
    expect(result.success).toBe(false);
  });
});
