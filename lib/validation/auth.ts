import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .email('Enter a valid email address.')
  .transform((email) => email.toLowerCase());

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const signUpSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name.').max(100),
    email: emailSchema,
    phone: z.string().trim().min(7, 'Enter your phone number.').max(30),
    referralCode: z.string().trim().max(40).transform((value) => value.toUpperCase()).default(''),
    instructorCode: z.string().trim().max(40).transform((value) => value.toUpperCase()).default(''),
    password: z.string(),
    passwordConfirmation: z.string(),
  })
  .refine((input) => input.password === input.passwordConfirmation, {
    message: 'Passwords must match.',
    path: ['passwordConfirmation'],
  });

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
