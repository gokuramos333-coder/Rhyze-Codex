export type AutomationTestAccount = {
  name: string;
  email: string;
  role: 'OWNER' | 'INSTRUCTOR' | 'MEMBER';
  expectedPath: '/admin/instructors' | '/instructor' | '/member';
  keychainService: string;
  publicInstructorProfile?: false;
};

export const AUTOMATION_TEST_ACCOUNTS: readonly AutomationTestAccount[] = [
  {
    name: 'Rhyze Automated Test Admin',
    email: 'automation-admin@rhyze.local',
    role: 'OWNER',
    expectedPath: '/admin/instructors',
    keychainService: 'com.rhyze-fitness.automation.admin',
  },
  {
    name: 'Rhyze Automated Test Instructor',
    email: 'automation-instructor@rhyze.local',
    role: 'INSTRUCTOR',
    expectedPath: '/instructor',
    keychainService: 'com.rhyze-fitness.automation.instructor',
    publicInstructorProfile: false,
  },
  {
    name: 'Rhyze Automated Test Member',
    email: 'automation-member@rhyze.local',
    role: 'MEMBER',
    expectedPath: '/member',
    keychainService: 'com.rhyze-fitness.automation.member',
  },
] as const;

export type AutomationAccountBusinessActivity = {
  stripeCustomerId: string | null;
  instructorApplication?: unknown | null;
  referralAttribution?: unknown | null;
  referralCommission?: unknown | null;
  memberConversation?: unknown | null;
  sombleClientProfile?: unknown | null;
  _count: Record<string, number>;
};

export function hasAutomationAccountBusinessActivity(
  user: AutomationAccountBusinessActivity,
): boolean {
  return (
    Boolean(user.stripeCustomerId) ||
    Boolean(user.instructorApplication) ||
    Boolean(user.referralAttribution) ||
    Boolean(user.referralCommission) ||
    Boolean(user.memberConversation) ||
    Boolean(user.sombleClientProfile) ||
    Object.values(user._count).some((count) => count > 0)
  );
}
