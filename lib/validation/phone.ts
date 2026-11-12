import { z } from 'zod';

export const PHONE_ERROR =
  'Enter 7–15 digits, with an optional leading + and spaces, parentheses, dots or hyphens.';

export function isValidPhone(value: string, optional = false): boolean {
  const phone = value.trim();
  if (!phone) return optional;
  if (!/^\+?[0-9 ().-]+$/.test(phone)) return false;
  const digits = phone.replace(/[^0-9]/g, '').length;
  return digits >= 7 && digits <= 15;
}

export const requiredPhoneSchema = z
  .string()
  .trim()
  .max(80)
  .refine((value) => isValidPhone(value), PHONE_ERROR);
export const optionalPhoneSchema = z
  .string()
  .trim()
  .max(80)
  .refine((value) => isValidPhone(value, true), PHONE_ERROR);
