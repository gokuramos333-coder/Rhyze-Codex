export type InstructorStatusAction = 'APPROVE' | 'REVOKE';

export function instructorStatusTransition(action: InstructorStatusAction) {
  return action === 'APPROVE'
    ? {
        role: 'INSTRUCTOR' as const,
        profileActive: true,
        applicationStatus: 'APPROVED' as const,
        referralActive: true,
      }
    : {
        role: 'MEMBER' as const,
        profileActive: false,
        applicationStatus: 'REJECTED' as const,
        referralActive: false,
      };
}
