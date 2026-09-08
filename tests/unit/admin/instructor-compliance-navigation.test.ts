import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('instructor directory and compliance navigation', () => {
  it('shows instructor photos beside active directory names', () => {
    const page = readFileSync(
      'app/(studio)/admin/instructors/page.tsx',
      'utf8',
    );
    const directory = readFileSync(
      'components/admin/InstructorDirectoryOrder.tsx',
      'utf8',
    );

    expect(page).toContain(
      'photoUrl: item.instructorProfile?.photoUrl || null',
    );
    expect(directory).toContain('photoUrl: string | null');
    expect(directory).toContain('alt={`${item.name} instructor photo`}');
  });

  it('uses photo upload as the only admin instructor photo input', () => {
    const directoryPage = readFileSync(
      'app/(studio)/admin/instructors/page.tsx',
      'utf8',
    );
    const inviteForm = readFileSync(
      'components/admin/InstructorInviteForm.tsx',
      'utf8',
    );
    const profilePage = readFileSync(
      'app/(studio)/admin/instructors/[userId]/page.tsx',
      'utf8',
    );
    const actions = readFileSync(
      'app/(studio)/admin/instructors/actions.ts',
      'utf8',
    );

    expect(directoryPage).toContain('<InstructorInviteForm action={createInstructorAction} />');
    expect(inviteForm).toContain('aria-label="Choose instructor photo"');
    expect(inviteForm).toContain("formData.set('photo'");
    expect(inviteForm).toContain('Instructor photo <span className="text-rhyze-black/40">(optional)</span>');
    expect(inviteForm).not.toContain('id="instructor-photo"\n            required');
    expect(directoryPage).not.toContain('name="photoUrl"');
    expect(directoryPage).not.toContain('Photo path or URL');
    expect(profilePage).toContain('<Span>Upload photo</Span>');
    expect(profilePage).toContain('name="photo"');
    expect(profilePage).not.toContain('name="photoUrl"');
    expect(profilePage).not.toContain('Photo path or URL');
    expect(actions).toContain('let photoUrl: string | null = null;');
    expect(actions).toContain('let nextPhotoUrl = current?.photoUrl || null;');
    expect(actions).not.toContain("formData.get('photoUrl')");
  });

  it('keeps credentials in one section without repeating signup waiver status', () => {
    const source = readFileSync(
      'app/(studio)/admin/instructors/[userId]/page.tsx',
      'utf8',
    );
    const actions = readFileSync(
      'app/(studio)/admin/instructors/[userId]/actions.ts',
      'utf8',
    );

    expect(source).not.toContain('Current studio waiver');
    expect(source).toContain('id="credential-upload"');
    expect(source).not.toContain('id="credential-files"');
    expect(source).not.toContain('label="Insurance"');
    expect(source).not.toContain('label="CPR certification"');
    expect(source).toContain('w-full min-w-0');
    expect(source).toContain('adminUploadCredentialAction');
    expect(actions).not.toContain('#credential-files');
  });

  it('keeps credential completion in the instructor portal without repeating the signup waiver', () => {
    const source = readFileSync(
      'app/(portal)/instructor/profile/page.tsx',
      'utf8',
    );

    expect(source).not.toContain('href="/member/waiver"');
    expect(source).toContain('href="/instructor/profile#credentials"');
    expect(source).toContain('action={uploadCredentialAction}');
  });

  it('keeps referrals above compliance and credentials adjacent to compliance', () => {
    const source = readFileSync(
      'app/(studio)/admin/instructors/[userId]/page.tsx',
      'utf8',
    );
    const referralsIndex = source.indexOf('id="referrals"');
    const complianceIndex = source.indexOf('>COMPLIANCE</h2>');
    const credentialsIndex = source.indexOf('id="credential-upload"');

    expect(referralsIndex).toBeGreaterThan(-1);
    expect(complianceIndex).toBeGreaterThan(referralsIndex);
    expect(credentialsIndex).toBeGreaterThan(complianceIndex);
    expect(source).not.toContain(
      'Instructors normally upload these privately from My Profile.',
    );
    expect(source).not.toContain(
      'An admin may securely attach, review, and download a document here.',
    );
  });
});
