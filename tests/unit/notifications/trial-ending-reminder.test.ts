import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('intro trial ending reminder', () => {
  it('queues a deduplicated email one day before trial expiration', () => {
    const action = readFileSync('app/(portal)/member/bookings/actions.ts', 'utf8');
    expect(action).toContain("template: 'TRIAL_ENDING'");
    expect(action).toContain('trial-ending:');
    expect(action).toContain('INTRO_TRIAL_REMINDER_LEAD_MS');
  });
});
