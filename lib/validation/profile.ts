import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .max(120)
  .transform((value) => value || null);

export const profileSchema = z
  .object({
    preferredName: optionalText,
    phone: optionalText,
    addressLine1: optionalText.optional(),
    addressLine2: optionalText.optional(),
    city: optionalText.optional(),
    region: optionalText.optional(),
    postalCode: optionalText.optional(),
    emergencyContactName: optionalText,
    emergencyContactPhone: optionalText,
  })
  .superRefine((profile, context) => {
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
  });

export const notificationPreferenceSchema = z.object({
  classReminders: z.boolean(),
  marketingEmail: z.boolean(),
});
