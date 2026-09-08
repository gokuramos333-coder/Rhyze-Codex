import { describe, expect, it } from 'vitest';
import {
  signUpInputFromFormData,
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
      firstName: 'Maya',
      lastName: 'Collins',
      email: 'maya@example.com',
      phone: '(973) 555-0101',
      birthdayMonth: '4',
      birthdayDay: '12',
      waiverAccepted: true,
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

  it('normalizes the required member fields during signup', () => {
    expect(
      signUpSchema.parse({
        firstName: '  Maya  ',
        lastName: '  Collins  ',
        email: ' MAYA@EXAMPLE.COM ',
        phone: '(973) 555-0101',
        birthdayMonth: '4',
        birthdayDay: '12',
        waiverAccepted: true,
        password: 'Rhyze26!A',
        passwordConfirmation: 'Rhyze26!A',
      }),
    ).toMatchObject({
      name: 'Maya Collins',
      email: 'maya@example.com',
      phone: '(973) 555-0101',
      dateOfBirth: new Date('2000-04-12T12:00:00.000Z'),
      waiverAccepted: true,
    });
  });

  it('requires a phone number during signup', () => {
    const result = signUpSchema.safeParse({
      firstName: 'Maya',
      lastName: 'Collins',
      email: 'maya@example.com',
      phone: '',
      birthdayMonth: '4',
      birthdayDay: '12',
      waiverAccepted: true,
      password: 'Rhyze26!A',
      passwordConfirmation: 'Rhyze26!A',
    });
    expect(result.success).toBe(false);
  });

  it('maps every signup form field into server validation input', () => {
    const formData = new FormData();
    formData.set('firstName', 'Gui');
    formData.set('lastName', 'Instructor');
    formData.set('email', 'gui@example.com');
    formData.set('phone', '9084569351');
    formData.set('birthdayMonth', '4');
    formData.set('birthdayDay', '12');
    formData.set('password', 'Guitesting777!');
    formData.set('passwordConfirmation', 'Guitesting777!');
    formData.set('waiverAccepted', 'on');

    expect(signUpInputFromFormData(formData)).toEqual({
      firstName: 'Gui',
      lastName: 'Instructor',
      email: 'gui@example.com',
      phone: '9084569351',
      birthdayMonth: '4',
      birthdayDay: '12',
      password: 'Guitesting777!',
      passwordConfirmation: 'Guitesting777!',
      waiverAccepted: true,
      mediaConsent: false,
    });
  });

  it('requires waiver acceptance during signup', () => {
    const result = signUpSchema.safeParse({
      firstName: 'Maya',
      lastName: 'Collins',
      email: 'maya@example.com',
      phone: '(973) 555-0101',
      birthdayMonth: '4',
      birthdayDay: '12',
      waiverAccepted: false,
      password: 'Rhyze26!A',
      passwordConfirmation: 'Rhyze26!A',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an impossible month and day without asking for a year', () => {
    const result = signUpSchema.safeParse({
      firstName: 'Maya',
      lastName: 'Collins',
      email: 'maya@example.com',
      phone: '(973) 555-0101',
      birthdayMonth: '2',
      birthdayDay: '30',
      waiverAccepted: true,
      password: 'Rhyze26!A',
      passwordConfirmation: 'Rhyze26!A',
    });

    expect(result.success).toBe(false);
  });
});
