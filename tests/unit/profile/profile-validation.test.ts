import { describe, expect, it } from 'vitest';
import { profileSchema } from '@/lib/validation/profile';

describe('member profile validation', () => {
  it('normalizes optional blank fields and stores only birthday month and day', () => {
    const result = profileSchema.parse({
      preferredName: ' Maya ',
      phone: ' ',
      birthdayMonth: '4',
      birthdayDay: '12',
      emergencyContactName: '',
      emergencyContactPhone: '',
    });

    expect(result).toEqual({
      preferredName: 'Maya',
      phone: null,
      dateOfBirth: new Date('2000-04-12T12:00:00.000Z'),
      emergencyContactName: null,
      emergencyContactPhone: null,
    });
  });

  it('requires both emergency-contact fields when either is provided', () => {
    const result = profileSchema.safeParse({
      preferredName: '',
      phone: '',
      birthdayMonth: '4',
      birthdayDay: '12',
      emergencyContactName: 'Jordan Collins',
      emergencyContactPhone: '',
    });

    expect(result.success).toBe(false);
  });
});
