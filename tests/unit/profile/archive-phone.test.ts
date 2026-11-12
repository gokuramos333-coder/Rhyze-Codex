import { describe, expect, it } from 'vitest';
import { signUpSchema } from '@/lib/validation/auth';
import { parseAdminClientInput } from '@/lib/domain/accounts/admin-client-creation';
import { profileSchema } from '@/lib/validation/profile';

const base = {
  firstName: 'Test',
  lastName: 'Client',
  email: 'test@example.com',
  birthdayMonth: 4,
  birthdayDay: 12,
  waiverAccepted: true,
  password: 'Example1!',
  passwordConfirmation: 'Example1!',
};
describe('phone input policy', () => {
  it.each([
    'mail@example.com',
    'abcdefghij',
    '123-abc-7890',
    '123456',
    '+1234567890123456',
  ])('rejects %s at creation and profile boundaries', (phone) => {
    expect(signUpSchema.safeParse({ ...base, phone }).success).toBe(false);
    expect(() => parseAdminClientInput({ ...base, phone })).toThrow();
    expect(
      profileSchema.safeParse({
        preferredName: '',
        phone,
        birthdayMonth: 4,
        birthdayDay: 12,
        emergencyContactName: '',
        emergencyContactPhone: '',
      }).success,
    ).toBe(false);
  });
  it.each(['+44 (20) 7946-0958', '201.555.0123', '555-0123'])(
    'accepts %s without changing punctuation',
    (phone) => {
      expect(signUpSchema.parse({ ...base, phone }).phone).toBe(phone);
      expect(parseAdminClientInput({ ...base, phone }).phone).toBe(phone);
    },
  );
});
