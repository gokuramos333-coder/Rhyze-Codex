import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const classesPageSource = () =>
  readFileSync('app/(studio)/admin/classes/page.tsx', 'utf8');

const classesCalendarSource = () =>
  readFileSync('components/admin/AdminClassesCalendar.tsx', 'utf8');

const classGallerySource = () =>
  readFileSync('components/admin/ClassGalleryManager.tsx', 'utf8');

const classesActionsSource = () =>
  readFileSync('app/(studio)/admin/classes/actions.ts', 'utf8');

const slideshowPageSource = () =>
  readFileSync('app/(studio)/admin/slideshow/page.tsx', 'utf8');

const rosterPageSource = () =>
  readFileSync('app/(studio)/admin/schedule/[occurrenceId]/roster/page.tsx', 'utf8');

const membersPageSource = () =>
  readFileSync('app/(studio)/admin/members/page.tsx', 'utf8');

const memberDetailPageSource = () =>
  readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

describe('admin class and client surfaces', () => {
  it('keeps Slideshow separate while organizing the three Classes sections', () => {
    const source = classesPageSource();
    const gallerySource = classGallerySource();
    const slideshowSource = slideshowPageSource();

    expect(gallerySource).toContain('id="slideshow-photos"');
    expect(gallerySource).toContain('SLIDESHOW PHOTOS');
    expect(slideshowSource).toContain('<ClassGalleryManager');
    expect(source).not.toContain('<ClassGalleryManager');
    expect(source).toContain('id="scheduled-classes"');
    expect(source).toContain('SCHEDULED CLASSES');
    expect(source).toContain('id="create-a-class"');
    expect(source).toContain('CREATE A CLASS');
    expect(source).toContain('id="edit-a-class"');
    expect(source).toContain('EDIT A CLASS');
  });

  it('keeps Delete distinct from Archive when a class has protected history', () => {
    const pageSource = classesPageSource();
    const actionSource = classesActionsSource();
    const deleteAction = actionSource
      .split('export async function deleteClassTemplateAction')[1]
      .split('export async function createOccurrenceAction')[0];

    expect(pageSource).toContain(
      'This class has history and cannot be deleted. Archive it instead.',
    );
    expect(deleteAction).toContain('classTemplateHasProtectedHistory');
    expect(deleteAction).toContain('classMessages: true');
    expect(deleteAction).toContain('commerceOrders: true');
    expect(deleteAction).not.toContain('classTemplate.update');
  });

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
    const calendarSource = classesCalendarSource();

    expect(source).toContain('scheduledOccurrences');
    expect(source).toContain('resolveScheduleOccurrenceRange');
    expect(calendarSource).toContain("{ id: 'day', label: 'Daily' }");
    expect(calendarSource).toContain("{ id: 'week', label: 'Weekly' }");
    expect(calendarSource).toContain("{ id: 'month', label: 'Monthly' }");
    expect(source).toContain('SCHEDULED CLASSES');
    expect(source).toContain('startAt: { gte: occurrenceQueryRange.start, lt: occurrenceQueryRange.end }');
    expect(source).not.toContain("status: 'SCHEDULED',\n        startAt: { gte: occurrenceRange.start");
    expect(source).toContain('including past dates');
  });

  it('links each class occurrence to manage so admins can change coverage instructors', () => {
    const source = classesCalendarSource();

    expect(source).toContain('href={`/admin/schedule/${occurrence.id}`}');
    expect(source).toContain('Manage');
    expect(source).toContain('href={`/admin/schedule/${occurrence.id}/roster`}');
  });

  it('shows manage and cancel controls on each class template next occurrence card', () => {
    const source = classesPageSource();

    expect(source).toContain('href={`/admin/schedule/${template.occurrences[0].id}`}');
    expect(source).toContain('href={`/admin/schedule/${template.occurrences[0].id}?cancel=1`}');
    expect(source).toContain('Manage next class');
    expect(source).toContain('Cancel next class');
  });

  it('uses date navigation instead of a separate Past Classes section', () => {
    const source = classesPageSource();
    const calendarSource = classesCalendarSource();

    expect(source).not.toContain('UPCOMING CLASSES');
    expect(source).not.toContain('PAST CLASSES');
    expect(source).not.toContain('pastOccurrences');
    expect(calendarSource).toContain('including a past date');
    expect(calendarSource).toContain("calendarHref('day', day.dateKey)");
    expect(source).not.toContain('occurrenceRevenueCents');
    expect(source).not.toContain('classRevenueLabel');
    expect(source).not.toContain('Membership / trial access');
  });

  it('labels cancelled class occurrences and exposes the cancellation reason in Admin Classes', () => {
    const source = classesCalendarSource();

    expect(source).toContain('cancellationReason');
    expect(source).toContain("occurrence.status === 'CANCELLED'");
    expect(source).toContain('Class canceled');
    expect(source).toContain('Cancellation reason:');
  });
});
