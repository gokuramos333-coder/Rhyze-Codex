import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('birthday reminder job wiring', () => {
  it('runs from daily maintenance and queues planned reminder emails', () => {
    const maintenance = readFileSync('netlify/functions/daily-maintenance.ts', 'utf8');
    const route = readFileSync('app/api/jobs/birthdays/route.ts', 'utf8');

    expect(maintenance).toContain("runProtectedJob('/api/jobs/birthdays')");
    expect(route).toContain('buildBirthdayReminderPlans');
    expect(route).toContain('queueEmail');
    expect(route).toContain('JOB_SECRET');
    expect(route).toContain('dateOfBirth');
  });
});
