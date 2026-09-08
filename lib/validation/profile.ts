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
    phone: optionalText,
    birthdayMonth: z.coerce.number().int().min(1).max(12),
    birthdayDay: z.coerce.number().int().min(1).max(31),
    addressLine1: optionalText.optional(),
    addressLine2: optionalText.optional(),
    city: optionalText.optional(),
    region: optionalText.optional(),
    postalCode: optionalText.optional(),
    emergencyContactName: optionalText,
    emergencyContactPhone: optionalText,
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
