import { describe, expect, it } from 'vitest';
import {
  buildInstructorApprovalNotifications,
  INSTRUCTOR_APPROVAL_RECIPIENTS,
} from '@/lib/domain/onboarding/instructor-approval-notifications';

describe('instructor approval notifications', () => {
  it('notifies both owners with recipient-specific dedupe keys', () => {
    expect(INSTRUCTOR_APPROVAL_RECIPIENTS).toEqual([
      'vanessa@rhyzefit.com',
      'melissa@rhyzefit.com',
    ]);
    expect(
      buildInstructorApprovalNotifications({
        applicationId: 'application-1',
        applicantName: 'Gui Instructor',
        applicantEmail: 'gui@example.com',
      }),
    ).toEqual([
      expect.objectContaining({
        to: 'vanessa@rhyzefit.com',
        dedupeKey: 'instructor-approval:application-1:vanessa@rhyzefit.com',
        payload: expect.objectContaining({ adminPath: '/admin/instructors' }),
      }),
      expect.objectContaining({
        to: 'melissa@rhyzefit.com',
        dedupeKey: 'instructor-approval:application-1:melissa@rhyzefit.com',
      }),
    ]);
  });
});
