import type { Role, UserStatus } from '@prisma/client';

const APPROVED_OWNER_EMAILS = new Set([
  'vanessa@rhyzefit.com',
  'melissa@rhyzefit.com',
  'gui@westaffnj.com',
]);

export function approvedOwnerEmails(): string[] {
  return [...APPROVED_OWNER_EMAILS];
}

export type OwnerAccessInput = {
  email: string;
  role: Role;
  status: UserStatus;
};

export function isApprovedOwnerEmail(email: string): boolean {
  return APPROVED_OWNER_EMAILS.has(email.trim().toLowerCase());
}

export function isApprovedOwner(input: OwnerAccessInput): boolean {
  return (
    input.role === 'OWNER' &&
    input.status === 'ACTIVE' &&
    isApprovedOwnerEmail(input.email)
  );
}
