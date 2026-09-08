import { describe, expect, it } from 'vitest';
import {
  introTrialCreditCountdownMessage,
  introTrialDaysRemaining,
  introTrialIsExpired,
} from '@/lib/domain/memberships/membership-display';

describe('membership display', () => {
  it('does not start the intro countdown before the first booking', () => {
    expect(
      introTrialDaysRemaining({
        activatedAt: null,
        currentPeriodEnd: null,
        now: new Date('2026-07-26T12:00:00.000Z'),
      }),
    ).toBeNull();
  });

  it('shows calendar days remaining and never becomes negative', () => {
    expect(
      introTrialDaysRemaining({
        activatedAt: new Date('2026-07-23T12:00:00.000Z'),
        currentPeriodEnd: new Date('2026-07-30T12:00:00.000Z'),
        now: new Date('2026-07-26T13:00:00.000Z'),
      }),
    ).toBe(4);
    expect(
      introTrialDaysRemaining({
        activatedAt: new Date('2026-07-23T12:00:00.000Z'),
        currentPeriodEnd: new Date('2026-07-30T12:00:00.000Z'),
        now: new Date('2026-07-31T12:00:00.000Z'),
      }),
    ).toBe(0);
  });

  it('uses credit-box copy before and after the first trial booking', () => {
    expect(introTrialCreditCountdownMessage(null)).toBe(
      'Your 7-day countdown starts when you book your first standard class.',
    );
    expect(introTrialCreditCountdownMessage(7)).toBe('7 days left');
    expect(introTrialCreditCountdownMessage(1)).toBe('1 day left');
    expect(introTrialCreditCountdownMessage(0)).toBe('Trial expired');
  });

  it('marks only activated intro trials past the period end as expired', () => {
    const now = new Date('2026-08-20T12:00:00.000Z');

    expect(
      introTrialIsExpired({
        activatedAt: new Date('2026-08-11T12:00:00.000Z'),
        currentPeriodEnd: new Date('2026-08-18T12:00:00.000Z'),
        now,
      }),
    ).toBe(true);
    expect(
      introTrialIsExpired({
        activatedAt: null,
        currentPeriodEnd: null,
        now,
      }),
    ).toBe(false);
    expect(
      introTrialIsExpired({
        activatedAt: new Date('2026-08-18T12:00:00.000Z'),
        currentPeriodEnd: new Date('2026-08-25T12:00:00.000Z'),
        now,
      }),
    ).toBe(false);
  });

  it('expires stale trial rows from the first intro-trial class when membership dates are missing', () => {
    const firstClassAt = new Date('2026-08-11T12:00:00.000Z');

    expect(
      introTrialDaysRemaining({
        activatedAt: null,
        currentPeriodEnd: null,
        firstClassAt,
        now: new Date('2026-08-15T12:00:00.000Z'),
      }),
    ).toBe(3);
    expect(
      introTrialIsExpired({
        activatedAt: null,
        currentPeriodEnd: null,
        firstClassAt,
        now: new Date('2026-08-19T12:00:00.000Z'),
      }),
    ).toBe(true);
  });
});
