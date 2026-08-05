import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const classesPageSource = () =>
  readFileSync('app/(studio)/admin/classes/page.tsx', 'utf8');

const rosterPageSource = () =>
  readFileSync('app/(studio)/admin/schedule/[occurrenceId]/roster/page.tsx', 'utf8');

const membersPageSource = () =>
  readFileSync('app/(studio)/admin/members/page.tsx', 'utf8');

const memberDetailPageSource = () =>
  readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

describe('admin class and client surfaces', () => {
  it('syncs claimed imported client statuses before rendering the client directory', () => {
    const source = membersPageSource();

    expect(source).toContain('claimedAccountStatusUpdateWhere');
    expect(source).toContain("data: { status: 'ACTIVE' }");
    expect(source).toContain('role: member.role');
    expect(source).toContain(
      'isSombleTransferred: Boolean(member.sombleClientProfile)',
    );
    expect(source).not.toContain("member.role === 'INSTRUCTOR'");
  });

  it('uses the claimed-account signal on individual client records', () => {
    const source = memberDetailPageSource();

    expect(source).toContain('role: member.role');
    expect(source).toContain('hasClaimedAccount: Boolean(member.passwordHash)');
    expect(source).toContain(
      'isSombleTransferred: Boolean(member.sombleClientProfile)',
    );
  });

  it('uses the shared occurrence timezone formatter on the attendees page title details', () => {
    const source = rosterPageSource();

    expect(source).toContain('occurrenceAdminDateTimeLabel');
    expect(source).not.toContain('occurrence.startAt.toLocaleString()');
  });

  it('lets admins add a member from the attendee roster by client search', () => {
    const pageSource = rosterPageSource();
    const actionSource = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/roster/actions.ts', 'utf8');

    expect(pageSource).toContain('Add member to this class');
    expect(pageSource).toContain('name="memberQuery"');
    expect(pageSource).toContain('addMemberToClassAction');
    expect(actionSource).toContain('export async function addMemberToClassAction');
    expect(actionSource).toContain('booking.upsert');
    expect(actionSource).toContain("source: 'ADMIN_ADDED'");
    expect(actionSource).toContain("reason: 'Admin added member to class'");
  });

  it('shows all scheduled class occurrences with daily weekly and monthly controls', () => {
    const source = classesPageSource();

    expect(source).toContain('scheduledOccurrences');
    expect(source).toContain('resolveScheduleOccurrenceRange');
    expect(source).toContain('Daily');
    expect(source).toContain('Weekly');
    expect(source).toContain('Monthly');
    expect(source).toContain('ALL CLASSES');
    expect(source).toContain('startAt: { gte: occurrenceRange.start, lt: occurrenceRange.end }');
    expect(source).not.toContain("status: 'SCHEDULED',\n        startAt: { gte: occurrenceRange.start");
    expect(source).toContain('including past and upcoming rows');
  });

  it('links each class occurrence to manage so admins can change coverage instructors', () => {
    const source = classesPageSource();

    expect(source).toContain('href={`/admin/schedule/${occurrence.id}`}');
    expect(source).toContain('Manage');
    expect(source).toContain('href={`/admin/schedule/${occurrence.id}/roster`}');
  });

  it('separates upcoming and past classes and displays roster revenue beside signups', () => {
    const source = classesPageSource();

    expect(source).toContain('UPCOMING');
    expect(source).toContain('PAST');
    expect(source).toContain('bg-rhyze-black/5');
    expect(source).toContain('occurrenceRevenueCents');
    expect(source).toContain('text-emerald-700');
    expect(source).toContain('Revenue:');
  });
});
