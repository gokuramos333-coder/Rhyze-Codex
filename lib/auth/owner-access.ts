import type { Role, UserStatus } from '@prisma/client';

const APPROVED_OWNER_EMAILS = new Set([
  'vanessa@rhyzefit.com',
  'vxnessaramos@gmail.com',
  'melissa@rhyzefit.com',
  'gui@westaffnj.com',
]);

export type OwnerAccessInput = {
  email: string;
  role: Role;
  status: UserStatus;
};

export function isApprovedOwner(input: OwnerAccessInput): boolean {
  return (
    input.status === 'ACTIVE' &&
    APPROVED_OWNER_EMAILS.has(input.email.trim().toLowerCase())
  );
}
