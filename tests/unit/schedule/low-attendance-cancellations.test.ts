import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lowAttendanceCancellationReason } from '@/lib/domain/schedule/low-attendance-cancellations';

describe('low attendance cancellation job surface', () => {
  it('defines the 0-signups 2-hours-before-start cancellation reason', () => {
    expect(lowAttendanceCancellationReason).toContain('0 signups 2 hours before class start');
  });

  it('only targets scheduled occurrences in the next 2 hours with no confirmed bookings', () => {
    const source = readFileSync('lib/domain/schedule/low-attendance-cancellations.ts', 'utf8');

    expect(source).toContain("status: 'SCHEDULED'");
    expect(source).toContain('startAt: { gt: now, lte: cutoff }');
    expect(source).toContain('historicalSignupCount: 0');
    expect(source).toContain("bookings: { none: { status: 'CONFIRMED' } }");
  });

  it('cancels matching occurrences, audits them, and queues instructor email once per occurrence', () => {
    const source = readFileSync('lib/domain/schedule/low-attendance-cancellations.ts', 'utf8');
    const route = readFileSync('app/api/jobs/low-attendance-cancellations/route.ts', 'utf8');
    const netlifyFunction = readFileSync('netlify/functions/low-attendance-cancellations.ts', 'utf8');

    expect(source).toContain("status: 'CANCELLED'");
    expect(source).toContain('cancelledAt: now');
    expect(source).toContain("action: 'class-occurrence.cancelled.low-attendance-job'");
    expect(source).toContain("template: 'CLASS_CANCELLED'");
    expect(source).toContain('low-attendance-instructor:${occurrence.id}');
    expect(route).toContain('authorization')
    expect(route).toContain('cancelLowAttendanceOccurrences(prisma)');
    expect(netlifyFunction).toContain("runProtectedJob('/api/jobs/low-attendance-cancellations')");
    expect(netlifyFunction).toContain("schedule: '* * * * *'");
  });
});
