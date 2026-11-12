import { expect, it } from 'vitest';
import { parseProfilePatch } from '@/lib/validation/profile';
const current = {
  phone: ' bad@example.com ',
  emergencyContactName: 'Emergency',
  emergencyContactPhone: 'legacy invalid',
  dateOfBirth: new Date('1985-04-12T12:00:00Z'),
};
const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
it('omits unchanged invalid historical phones and birthdays from an unrelated edit', () => {
  expect(
    parseProfilePatch(
      form({
        preferredName: 'New name',
        phone: current.phone,
        emergencyContactName: 'Emergency',
        emergencyContactPhone: current.emergencyContactPhone,
        birthdayMonth: '4',
        birthdayDay: '12',
      }),
      current,
    ),
  ).toEqual({ preferredName: 'New name' });
});
it('does not touch omitted fields or validate unrelated historical emergency fields', () => {
  expect(parseProfilePatch(form({ preferredName: 'Name' }), current)).toEqual({
    preferredName: 'Name',
  });
});
it('rejects newly invalid phones and accepts correction and explicit clear', () => {
  expect(() =>
    parseProfilePatch(form({ phone: 'different@example.com' }), current),
  ).toThrow();
  expect(
    parseProfilePatch(form({ phone: '+44 (20) 7946-0958' }), current),
  ).toEqual({ phone: '+44 (20) 7946-0958' });
  expect(parseProfilePatch(form({ phone: '' }), current)).toEqual({
    phone: null,
  });
});
it('preserves invalid unchanged emergency phone when only the name changes', () => {
  expect(
    parseProfilePatch(
      form({
        emergencyContactName: 'New contact',
        emergencyContactPhone: current.emergencyContactPhone,
      }),
      current,
    ),
  ).toEqual({ emergencyContactName: 'New contact' });
});
it('still requires a complete emergency contact when that scope changes', () => {
  expect(() =>
    parseProfilePatch(form({ emergencyContactName: '' }), current),
  ).toThrow();
  expect(
    parseProfilePatch(
      form({ emergencyContactName: '', emergencyContactPhone: '' }),
      current,
    ),
  ).toEqual({ emergencyContactName: null, emergencyContactPhone: null });
});
