import { hashPassword, validatePassword } from '@/lib/auth/password';

export type NewAccountInput = {
  name: string;
  email: string;
  password: string;
};

export type AccountRepository = {
  findByEmail(email: string): Promise<{ id: string } | null>;
  createMember(input: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<{ id: string; email: string }>;
};

export class AccountConflictError extends Error {
  constructor() {
    super('An account already exists for this email.');
    this.name = 'AccountConflictError';
  }
}

export class InvalidPasswordError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join(' '));
    this.name = 'InvalidPasswordError';
    this.errors = errors;
  }
}

export async function createAccount(
  input: NewAccountInput,
  repository: AccountRepository,
): Promise<{ id: string; email: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const passwordValidation = validatePassword(input.password);

  if (!passwordValidation.valid) {
    throw new InvalidPasswordError(passwordValidation.errors);
  }

  if (await repository.findByEmail(email)) {
    throw new AccountConflictError();
  }

  return repository.createMember({
    email,
    name,
    passwordHash: await hashPassword(input.password),
  });
}
