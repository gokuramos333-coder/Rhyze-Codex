import { hashPassword, validatePassword } from '@/lib/auth/password';
import { classifyInstructorCode } from '@/lib/domain/onboarding/instructor-application';

export type NewAccountInput = {
  name: string;
  email: string;
  phone: string;
  referralCode?: string;
  instructorCode?: string;
  password: string;
};

export type AccountRepository = {
  findByEmail(email: string): Promise<{ id: string } | null>;
  createMember(input: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    createInstructorApplication: boolean;
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

export class InvalidInstructorCodeError extends Error {
  constructor() {
    super('The instructor access code is not valid.');
    this.name = 'InvalidInstructorCodeError';
  }
}

export async function createAccount(
  input: NewAccountInput,
  repository: AccountRepository,
): Promise<{ id: string; email: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = input.phone.trim();
  const passwordValidation = validatePassword(input.password);
  const instructorCode = classifyInstructorCode(input.instructorCode || null);

  if (!passwordValidation.valid) {
    throw new InvalidPasswordError(passwordValidation.errors);
  }

  if (await repository.findByEmail(email)) {
    throw new AccountConflictError();
  }
  if (instructorCode === 'INVALID') throw new InvalidInstructorCodeError();

  return repository.createMember({
    email,
    name,
    phone,
    passwordHash: await hashPassword(input.password),
    createInstructorApplication: instructorCode === 'PENDING',
  });
}
