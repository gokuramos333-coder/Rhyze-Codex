import { requiredPhoneSchema } from '@/lib/validation/phone';
import { z } from 'zod';

export const callbackInputSchema = z.object({
  requestKey: z.string().uuid(),
  startAt: z
    .string()
    .datetime()
    .refine((value) => {
      const date = new Date(value);
      return (
        Number.isFinite(date.getTime()) &&
        date.toISOString() === value &&
        date.getUTCMinutes() % 15 === 0 &&
        date.getUTCSeconds() === 0 &&
        date.getUTCMilliseconds() === 0
      );
    }, 'Choose an available callback time.'),
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => !/[\r\n]/.test(value)),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  phone: requiredPhoneSchema,
  message: z.string().trim().max(2000).optional().default(''),
  website: z.literal('').optional().default(''),
});

export type CallbackInput = z.infer<typeof callbackInputSchema>;
