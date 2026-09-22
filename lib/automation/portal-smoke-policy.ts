import type { AutomationTestAccount } from './test-accounts';

type SmokeRole = AutomationTestAccount['role'];

// Explicit acceptance policy, independent from the guards under test. Owners are
// intentionally allowed to supervise instructor views; members are not.
const allowed: Record<SmokeRole, string[]> = {
  OWNER: ['/admin/instructors', '/admin/classes', '/admin/settings', '/member', '/instructor'],
  INSTRUCTOR: ['/instructor', '/instructor/schedule', '/instructor/profile', '/member'],
  MEMBER: ['/member', '/member/bookings', '/member/membership'],
};
const denied: Record<SmokeRole, string[]> = {
  OWNER: [],
  INSTRUCTOR: ['/admin/settings'],
  MEMBER: ['/admin/settings', '/instructor'],
};

export async function verifyPortalAccess(
  role: SmokeRole,
  checks: { open: (path: string) => Promise<void>; deny: (path: string) => Promise<void> },
) {
  for (const path of allowed[role]) await checks.open(path);
  for (const path of denied[role]) await checks.deny(path);
}
