import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('signup agreement surface', () => {
  const form = [
    readFileSync('components/domain/accounts/SignUpForm.tsx', 'utf8'),
    readFileSync('components/domain/accounts/BirthdayFields.tsx', 'utf8'),
  ].join('\n');

  it('requires the studio waiver and does not collect a referral code', () => {
    expect(form).toContain('name="waiverAccepted"');
    expect(form).toContain('required');
    expect(form).toContain('Required signature box');
    expect(form).toContain('Check this box to create your account');
    expect(form).toContain('h-7 w-7');
    expect(form).toContain('studio policies, waiver, and cancellation policy');
    expect(form).not.toContain('name="referralCode"');
  });

  it('requires first name, last name, email, cell phone, and birthdate during signup', () => {
    expect(form).toContain('name="firstName"');
    expect(form).toContain('name="lastName"');
    expect(form).toContain('name="email"');
    expect(form).toContain('name="phone"');
    expect(form).toContain('name="birthdayMonth"');
    expect(form).toContain('name="birthdayDay"');
    expect(form).not.toContain('name="dateOfBirth"');
    expect(form).not.toContain('type="date"');
    expect(form).toContain('No year needed');
    expect(form).toContain('free standard class');
  });

  it('does not request optional photo or video permission during signup', () => {
    expect(form).not.toContain('name="mediaConsent"');
    expect(form).not.toContain('photos or video of me in studio marketing');
  });
});
