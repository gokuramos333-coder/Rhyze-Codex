import { hash, verify } from '@node-rs/argon2';

const passwordRules = [
  {
    message: 'Use at least 12 characters.',
    passes: (password: string) => password.length >= 12,
  },
  {
    message: 'Include an uppercase letter.',
    passes: (password: string) => /[A-Z]/.test(password),
  },
  {
    message: 'Include a number.',
    passes: (password: string) => /\d/.test(password),
  },
  {
    message: 'Include a symbol.',
    passes: (password: string) => /[^A-Za-z0-9]/.test(password),
  },
] as const;

export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors = passwordRules
    .filter((rule) => !rule.passes(password))
    .map((rule) => rule.message);

  return { valid: errors.length === 0, errors };
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
