import { describe, expect, it } from 'vitest';
import { profileSchema } from '@/lib/validation/profile';

describe('member profile validation', () => {
  it('normalizes optional blank fields to null', () => {
    const result = profileSchema.parse({
      preferredName: ' Maya ',
      phone: ' ',
      emergencyContactName: '',
      emergencyContactPhone: '',
    });

    expect(result).toEqual({
      preferredName: 'Maya',
      phone: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
    });
  });

  it('requires both emergency-contact fields when either is provided', () => {
    const result = profileSchema.safeParse({
      preferredName: '',
      phone: '',
      emergencyContactName: 'Jordan Collins',
      emergencyContactPhone: '',
    });

    expect(result.success).toBe(false);
  });
});
