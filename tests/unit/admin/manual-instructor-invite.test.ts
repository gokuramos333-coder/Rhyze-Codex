import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('manual instructor invitations', () => {
  it('allows a profile to be invited before a bio or photo is ready', () => {
    const page = readFileSync('app/(studio)/admin/instructors/page.tsx', 'utf8');
    const form = readFileSync('components/admin/InstructorInviteForm.tsx', 'utf8');
    const actions = readFileSync('app/(studio)/admin/instructors/actions.ts', 'utf8');

    expect(page).toContain('InstructorInviteForm');
    expect(form).toContain('Bio and photo can be added later.');
    expect(form).not.toMatch(/name="photo"[^>]*required/);
    expect(actions).not.toContain("redirect('/admin/instructors?error=photo');\n  }");
  });

  it('invites new and existing members without bypassing instructor approval', () => {
    const actions = readFileSync('app/(studio)/admin/instructors/actions.ts', 'utf8');

    expect(actions).toContain("role: 'MEMBER'");
    expect(actions).toContain("isActive: false");
    expect(actions).toContain("template: 'INSTRUCTOR_WELCOME_INVITE'");
    expect(actions).toContain('issueAccountClaim');
    expect(actions).toContain('inAppNotification.upsert');
    expect(actions).not.toContain("role: 'INSTRUCTOR',\n      status: 'ACTIVE'");
  });

  it('gives existing members a code form that creates a pending application', () => {
    const page = readFileSync('app/(portal)/member/instructor-access/page.tsx', 'utf8');
    const actions = readFileSync('app/(portal)/member/instructor-access/actions.ts', 'utf8');

    expect(page).toContain('name="instructorCode"');
    expect(actions).toContain('classifyManualInstructorInvite');
    expect(actions).toContain("decision === 'NOT_INVITED'");
    expect(actions).toContain("status: 'PENDING'");
    expect(actions).toContain('queueInstructorApprovalNotifications');
  });
});
