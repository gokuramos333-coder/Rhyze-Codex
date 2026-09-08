const passwordRules = [
  {
    message: 'Use at least 9 characters.',
    passes: (password: string) => password.length >= 9,
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

async function loadArgon2() {
  return import('@node-rs/argon2');
}

export async function hashPassword(password: string): Promise<string> {
  const { hash } = await loadArgon2();

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
    const { verify } = await loadArgon2();
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
