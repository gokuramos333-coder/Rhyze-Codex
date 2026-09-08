import { hashPassword, validatePassword } from '@/lib/auth/password';

export type NewAccountInput = {
  name: string;
  email: string;
  phone: string;
  dateOfBirth: Date;
  waiverAccepted: boolean;
  waiverVersionId: string;
  mediaConsent?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  password: string;
};

export type AccountRepository = {
  findByEmail(email: string): Promise<{ id: string } | null>;
  createMember(input: {
    name: string;
    email: string;
    phone: string;
    dateOfBirth: Date;
    passwordHash: string;
    waiverVersionId: string;
    mediaConsent: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<{
    id: string;
    email: string;
  }>;
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

export class AgreementRequiredError extends Error {
  constructor() {
    super('The studio policies and waiver must be accepted.');
    this.name = 'AgreementRequiredError';
  }
}

export async function createAccount(
  input: NewAccountInput,
  repository: AccountRepository,
): Promise<{
  id: string;
  email: string;
}> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = input.phone.trim();
  const passwordValidation = validatePassword(input.password);

  if (!passwordValidation.valid) {
    throw new InvalidPasswordError(passwordValidation.errors);
  }

  if (await repository.findByEmail(email)) {
    throw new AccountConflictError();
  }
  if (!input.waiverAccepted || !input.waiverVersionId) {
    throw new AgreementRequiredError();
  }
  return repository.createMember({
    email,
    name,
    phone,
    dateOfBirth: input.dateOfBirth,
    passwordHash: await hashPassword(input.password),
    waiverVersionId: input.waiverVersionId,
    mediaConsent: input.mediaConsent ?? false,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}
