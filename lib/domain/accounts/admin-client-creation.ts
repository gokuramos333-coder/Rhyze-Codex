import { z } from 'zod';
import { birthdayDateFromMonthDay } from '@/lib/domain/birthdays/birthday-reminders';

const adminClientInputSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter a first name.').max(50),
  lastName: z.string().trim().min(1, 'Enter a last name.').max(50),
  email: z.string().trim().email('Enter a valid email address.').transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(7, 'Enter a cell phone number.').max(30),
  birthdayMonth: z.coerce.number().int().min(1).max(12),
  birthdayDay: z.coerce.number().int().min(1).max(31),
});

export type AdminClientInput = {
  name: string;
  email: string;
  phone: string;
  dateOfBirth: Date;
};

export type AdminClientRepository = {
  findByEmail(email: string): Promise<{ id: string } | null>;
  createInvitedMember(input: AdminClientInput & { actorId: string }): Promise<{ id: string; email: string }>;
};

export class AdminClientConflictError extends Error {
  constructor() {
    super('A client account already exists for this email.');
    this.name = 'AdminClientConflictError';
  }
}

export function parseAdminClientInput(input: Record<string, unknown>): AdminClientInput {
  const parsed = adminClientInputSchema.parse(input);
  let dateOfBirth: Date;
  try {
    dateOfBirth = birthdayDateFromMonthDay(parsed.birthdayMonth, parsed.birthdayDay);
  } catch {
    throw new Error('Enter a valid birthday.');
  }
  return {
    name: `${parsed.firstName} ${parsed.lastName}`,
    email: parsed.email,
    phone: parsed.phone,
    dateOfBirth,
  };
}

export async function createAdminClient(input: {
  actorId: string;
  input: AdminClientInput;
  repository: AdminClientRepository;
}) {
  if (await input.repository.findByEmail(input.input.email)) {
    throw new AdminClientConflictError();
  }
  return input.repository.createInvitedMember({
    ...input.input,
    actorId: input.actorId,
  });
}
