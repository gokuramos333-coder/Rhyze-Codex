import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('profile completion reminder job', () => {
  const route = readFileSync('app/api/jobs/waiver-reminders/route.ts', 'utf8');
  const templates = readFileSync('lib/notifications/email-templates.ts', 'utf8');

  it('queues reminders for members missing profile birthdate/contact details or waiver acceptance', () => {
    expect(route).toContain('PROFILE_COMPLETION_REMINDER');
    expect(route).toContain('dateOfBirth');
    expect(route).toContain('waiverAcceptances');
    expect(route).toContain('profileUrl');
    expect(route).toContain('waiverUrl');
    expect(route).not.toContain('retired: true');
  });

  it('tells members to update full information, birthday month and day, and waivers for a free class', () => {
    expect(templates).toContain('PROFILE_COMPLETION_REMINDER');
    expect(templates).toContain('free standard class');
    expect(templates).toContain('birthday month and day');
    expect(templates).toContain('waiver');
    expect(templates).toContain('cancellation polic');
  });
});
