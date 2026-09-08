import { z } from 'zod';
import { birthdayDateFromMonthDay } from '@/lib/domain/birthdays/birthday-reminders';

const emailSchema = z
  .string()
  .trim()
  .email('Enter a valid email address.')
  .transform((email) => email.toLowerCase());

const birthdayMonthSchema = z.coerce.number().int().min(1).max(12);
const birthdayDaySchema = z.coerce.number().int().min(1).max(31);

function addBirthdayIssue(
  input: { birthdayMonth: number; birthdayDay: number },
  context: z.RefinementCtx,
) {
  try {
    birthdayDateFromMonthDay(input.birthdayMonth, input.birthdayDay);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enter a valid birthday.',
      path: ['birthdayDay'],
    });
  }
}

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const signUpSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Enter your first name.').max(50),
    lastName: z.string().trim().min(1, 'Enter your last name.').max(50),
    email: emailSchema,
    phone: z.string().trim().min(7, 'Enter your cell phone number.').max(30),
    birthdayMonth: birthdayMonthSchema,
    birthdayDay: birthdayDaySchema,
    waiverAccepted: z.literal(true, {
      errorMap: () => ({ message: 'Accept the studio policies and waiver to create an account.' }),
    }),
    mediaConsent: z.boolean().default(false),
    password: z.string(),
    passwordConfirmation: z.string(),
  })
  .superRefine((input, context) => {
    addBirthdayIssue(input, context);
    if (input.password !== input.passwordConfirmation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords must match.',
        path: ['passwordConfirmation'],
      });
    }
  })
  .transform((input) => ({
    ...input,
    name: `${input.firstName} ${input.lastName}`,
    dateOfBirth: birthdayDateFromMonthDay(
      input.birthdayMonth,
      input.birthdayDay,
    ),
  }));

export function signUpInputFromFormData(formData: FormData) {
  return {
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    birthdayMonth: formData.get('birthdayMonth'),
    birthdayDay: formData.get('birthdayDay'),
    password: formData.get('password'),
    passwordConfirmation: formData.get('passwordConfirmation'),
    waiverAccepted: formData.get('waiverAccepted') === 'on',
    mediaConsent: formData.get('mediaConsent') === 'on',
  };
}

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string(),
    passwordConfirmation: z.string(),
  })
  .refine((input) => input.password === input.passwordConfirmation, {
    message: 'Passwords must match.',
    path: ['passwordConfirmation'],
  });

export const accountClaimSchema = z
  .object({
    token: z.string().min(1),
    birthdayMonth: birthdayMonthSchema,
    birthdayDay: birthdayDaySchema,
    waiverAccepted: z.literal(true, {
      errorMap: () => ({ message: 'Accept the studio policies and waiver to activate your account.' }),
    }),
    mediaConsent: z.boolean().default(false),
    password: z.string(),
    passwordConfirmation: z.string(),
  })
  .superRefine((input, context) => {
    addBirthdayIssue(input, context);
    if (input.password !== input.passwordConfirmation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords must match.',
        path: ['passwordConfirmation'],
      });
    }
  })
  .transform((input) => ({
    ...input,
    dateOfBirth: birthdayDateFromMonthDay(
      input.birthdayMonth,
      input.birthdayDay,
    ),
  }));
