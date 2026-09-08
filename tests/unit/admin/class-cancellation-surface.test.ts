import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin class cancellation controls', () => {
  it('puts a cancel class control directly next to each admin class occurrence without immediately sending emails', () => {
    const classesPage = readFileSync('app/(studio)/admin/classes/page.tsx', 'utf8');
    const schedulePage = readFileSync('app/(studio)/admin/schedule/page.tsx', 'utf8');

    for (const source of [classesPage, schedulePage]) {
      expect(source).toContain('Cancel class');
      expect(source).toContain('cancel=1');
      expect(source).not.toContain('<form action={cancelOccurrenceAction}>');
      expect(source).not.toContain('name="reason" value={cancelLowAttendanceReason}');
    }
  });

  it('requires admins to choose or enter the cancellation reason before notifying members', () => {
    const managePage = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/page.tsx', 'utf8');
    const actions = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/actions.ts', 'utf8');

    expect(managePage).toContain('Before emails are sent');
    expect(managePage).toContain('name="cancellationReasonType"');
    expect(managePage).toContain('Weather related');
    expect(managePage).toContain('Instructor emergency');
    expect(managePage).toContain('General apology');
    expect(managePage).toContain('Custom reason');
    expect(managePage).toContain('name="customCancellationReason"');
    expect(actions).toContain('resolveCancellationReason');
  });

  it('documents the low-attendance cancellation rule for admins', () => {
    const classesPage = readFileSync('app/(studio)/admin/classes/page.tsx', 'utf8');
    expect(classesPage).toContain('0 signups 2 hours before class start');
    expect(classesPage).toContain('low attendance');
  });

  it('uses a friendly attendee email that apologizes for the inconvenience', () => {
    const templates = readFileSync('lib/notifications/email-templates.ts', 'utf8');
    expect(templates).toContain('We apologize for the inconvenience');
    expect(templates).toContain('We hope to see you in another class soon');
  });
});
