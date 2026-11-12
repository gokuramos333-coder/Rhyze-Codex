import { optionalPhoneSchema } from '@/lib/validation/phone';
import { z } from 'zod';
import { birthdayDateFromMonthDay } from '@/lib/domain/birthdays/birthday-reminders';

const optionalText = z
  .string()
  .trim()
  .max(120)
  .transform((value) => value || null);

export const profileSchema = z
  .object({
    preferredName: optionalText,
    phone: optionalPhoneSchema.transform((value) => value || null),
    birthdayMonth: z.coerce.number().int().min(1).max(12),
    birthdayDay: z.coerce.number().int().min(1).max(31),
    addressLine1: optionalText.optional(),
    addressLine2: optionalText.optional(),
    city: optionalText.optional(),
    region: optionalText.optional(),
    postalCode: optionalText.optional(),
    emergencyContactName: optionalText,
    emergencyContactPhone: optionalPhoneSchema.transform(
      (value) => value || null,
    ),
  })
  .superRefine((profile, context) => {
    try {
      birthdayDateFromMonthDay(profile.birthdayMonth, profile.birthdayDay);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid birthday.',
        path: ['birthdayDay'],
      });
    }
    if (
      Boolean(profile.emergencyContactName) !==
      Boolean(profile.emergencyContactPhone)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter both an emergency contact name and phone number.',
        path: [
          profile.emergencyContactName
            ? 'emergencyContactPhone'
            : 'emergencyContactName',
        ],
      });
    }
  })
  .transform(({ birthdayMonth, birthdayDay, ...profile }) => ({
    ...profile,
    dateOfBirth: birthdayDateFromMonthDay(birthdayMonth, birthdayDay),
  }));

export const notificationPreferenceSchema = z.object({
  classReminders: z.boolean(),
  marketingEmail: z.boolean(),
});

const patchFields = z
  .object({
    preferredName: optionalText,
    phone: optionalPhoneSchema.transform((value) => value || null),
    addressLine1: optionalText,
    addressLine2: optionalText,
    city: optionalText,
    region: optionalText,
    postalCode: optionalText,
    emergencyContactName: optionalText,
    emergencyContactPhone: optionalPhoneSchema.transform(
      (value) => value || null,
    ),
  })
  .partial();

type StoredProfile = Partial<
  Record<keyof z.infer<typeof patchFields>, string | null>
> & {
  dateOfBirth?: Date | null;
};

// An unchanged historical value is not a requested correction: omit it entirely.
export function parseProfilePatch(
  form: FormData,
  current: StoredProfile | null,
) {
  const input: Record<string, unknown> = {};
  for (const key of Object.keys(patchFields.shape) as (keyof z.infer<
    typeof patchFields
  >)[]) {
    if (!form.has(key)) continue;
    const value = form.get(key);
    if (
      typeof value === 'string' &&
      value.trim() === (current?.[key] ?? '').trim()
    )
      continue;
    input[key] = value;
  }
  const patch: z.infer<typeof patchFields> & { dateOfBirth?: Date } =
    patchFields.parse(input);
  if (form.has('birthdayMonth') || form.has('birthdayDay')) {
    const month = Number(form.get('birthdayMonth'));
    const day = Number(form.get('birthdayDay'));
    if (
      month !== (current?.dateOfBirth?.getUTCMonth() ?? -1) + 1 ||
      day !== current?.dateOfBirth?.getUTCDate()
    ) {
      patch.dateOfBirth = birthdayDateFromMonthDay(month, day);
    }
  }
  if ('emergencyContactName' in patch || 'emergencyContactPhone' in patch) {
    const name =
      patch.emergencyContactName === undefined
        ? current?.emergencyContactName
        : patch.emergencyContactName;
    const phone =
      patch.emergencyContactPhone === undefined
        ? current?.emergencyContactPhone
        : patch.emergencyContactPhone;
    if (Boolean(name?.trim()) !== Boolean(phone?.trim()))
      throw new Error('Enter both emergency contact fields.');
  }
  return patch;
}
