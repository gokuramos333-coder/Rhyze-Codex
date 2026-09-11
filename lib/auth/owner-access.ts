import type { Role, UserStatus } from '@prisma/client';

const OPERATIONAL_OWNER_EMAILS = [
  'vanessa@rhyzefit.com',
  'melissa@rhyzefit.com',
  'gui@westaffnj.com',
] as const;

const APPROVED_OWNER_EMAILS = new Set([
  ...OPERATIONAL_OWNER_EMAILS,
  'automation-admin@rhyze.local',
]);

export function approvedOwnerEmails(): string[] {
  return [...OPERATIONAL_OWNER_EMAILS];
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
