import { describe, expect, it } from 'vitest';
import { signUpInputFromFormData, signUpSchema } from '@/lib/validation/auth';

describe('signup required profile fields', () => {
  it('requires separate first name, last name, email, cell phone, and birthdate', () => {
    const parsed = signUpSchema.safeParse({
      firstName: 'Tara',
      lastName: 'Porter',
      email: 'tara@example.com',
      phone: '973-555-0101',
      birthdayMonth: '4',
      birthdayDay: '12',
      waiverAccepted: true,
      password: 'Rhyze!StrongPass2026',
      passwordConfirmation: 'Rhyze!StrongPass2026',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe('Tara Porter');
      expect(parsed.data.dateOfBirth).toEqual(new Date('2000-04-12T12:00:00.000Z'));
    }
  });

  it('rejects one-word names and missing birthdates', () => {
    const parsed = signUpSchema.safeParse({
      firstName: 'Tara',
      lastName: '',
      email: 'tara@example.com',
      phone: '973-555-0101',
      birthdayMonth: '',
      birthdayDay: '',
      waiverAccepted: true,
      password: 'Rhyze!StrongPass2026',
      passwordConfirmation: 'Rhyze!StrongPass2026',
    });

    expect(parsed.success).toBe(false);
  });

  it('reads the required signup fields from form data', () => {
    const formData = new FormData();
    formData.set('firstName', ' Tara ');
    formData.set('lastName', ' Porter ');
    formData.set('email', 'TARA@example.com');
    formData.set('phone', '973-555-0101');
    formData.set('birthdayMonth', '4');
    formData.set('birthdayDay', '12');
    formData.set('waiverAccepted', 'on');
    formData.set('password', 'Rhyze!StrongPass2026');
    formData.set('passwordConfirmation', 'Rhyze!StrongPass2026');

    expect(signUpInputFromFormData(formData)).toMatchObject({
      firstName: ' Tara ',
      lastName: ' Porter ',
      email: 'TARA@example.com',
      phone: '973-555-0101',
      birthdayMonth: '4',
      birthdayDay: '12',
      waiverAccepted: true,
    });
  });
});
