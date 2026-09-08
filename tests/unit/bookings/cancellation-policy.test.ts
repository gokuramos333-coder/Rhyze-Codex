import { describe, expect, it } from 'vitest';
import { cancellationPolicyDecision } from '@/lib/domain/bookings/cancellation-policy';

describe('class cancellation policy', () => {
  const startAt = new Date('2026-08-21T18:00:00.000Z');

  it('returns a standard credit only with more than six hours notice', () => {
    expect(cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T11:59:00.000Z'),
      accessType: 'STANDARD',
      isEvent: false,
      hasReservedCredit: true,
    })).toMatchObject({
      window: 'ADVANCE',
      action: 'CANCEL',
      status: 'CANCELLED',
      feeCents: 0,
      restoreCredit: true,
      confirmLabel: 'Cancel and return my credit',
    });
  });

  it('charges standard transfers but keeps VIP transfers free from six through two hours', () => {
    expect(cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T12:00:00.000Z'),
      accessType: 'STANDARD',
      isEvent: false,
      hasReservedCredit: true,
    })).toMatchObject({ window: 'TRANSFER', action: 'RESCHEDULE', feeCents: 500 });

    expect(cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T15:59:00.000Z'),
      accessType: 'VIP',
      isEvent: false,
      hasReservedCredit: false,
    })).toMatchObject({ window: 'TRANSFER', action: 'RESCHEDULE', feeCents: 0 });
  });

  it('warns trial members inside six hours without charging until the two-hour boundary', () => {
    expect(cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T14:00:00.000Z'),
      accessType: 'INTRO_TRIAL',
      isEvent: false,
      hasReservedCredit: false,
    })).toMatchObject({
      window: 'TRANSFER',
      action: 'CANCEL',
      status: 'CANCELLED',
      feeCents: 0,
    });
  });

  it('charges every paid access type ten dollars at exactly two hours', () => {
    const requestedAt = new Date('2026-08-21T16:00:00.000Z');
    expect(cancellationPolicyDecision({
      startAt,
      requestedAt,
      accessType: 'INTRO_TRIAL',
      isEvent: false,
      hasReservedCredit: false,
    })).toMatchObject({
      window: 'LATE',
      status: 'LATE_CANCELLED',
      feeCents: 1_000,
      restoreCredit: false,
    });
    expect(cancellationPolicyDecision({
      startAt,
      requestedAt,
      accessType: 'VIP',
      isEvent: false,
      hasReservedCredit: false,
    })).toMatchObject({ feeCents: 1_000, status: 'LATE_CANCELLED' });
  });

  it('makes standard late cancels lose the credit and pay ten dollars', () => {
    expect(cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T17:00:00.000Z'),
      accessType: 'STANDARD',
      isEvent: false,
      hasReservedCredit: true,
    })).toMatchObject({
      action: 'CANCEL',
      status: 'LATE_CANCELLED',
      feeCents: 1_000,
      restoreCredit: false,
      confirmLabel: 'Cancel and charge $10',
    });
  });

  it('returns event credits outside six hours with an obvious 30-day rebook notice', () => {
    expect(cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T11:59:00.000Z'),
      accessType: 'VIP',
      isEvent: true,
      hasReservedCredit: false,
    })).toMatchObject({
      window: 'ADVANCE',
      action: 'CANCEL',
      status: 'CANCELLED',
      feeCents: 0,
      restoreCredit: true,
      confirmLabel: 'I understand — cancel and return my event credit',
    });
    expect(cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T11:59:00.000Z'),
      accessType: 'VIP',
      isEvent: true,
      hasReservedCredit: false,
    }).message).toContain('rebook another event within 30 days');
  });

  it('charges a five dollar event transfer fee inside six hours but before two hours and returns a 30-day event credit', () => {
    expect(cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T14:30:00.000Z'),
      accessType: 'VIP',
      isEvent: true,
      hasReservedCredit: false,
    })).toMatchObject({
      window: 'TRANSFER',
      action: 'CANCEL',
      status: 'CANCELLED',
      feeCents: 500,
      restoreCredit: true,
      confirmLabel: 'I understand — cancel and charge $5',
    });
  });

  it('forfeits event credits inside two hours with no replacement credit', () => {
    expect(cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T16:00:00.000Z'),
      accessType: 'VIP',
      isEvent: true,
      hasReservedCredit: false,
    })).toMatchObject({
      window: 'LATE',
      action: 'CANCEL',
      status: 'LATE_CANCELLED',
      feeCents: 0,
      restoreCredit: false,
      confirmLabel: 'I understand — cancel and lose my event credit',
    });
  });

  it('never charges complimentary bookings', () => {
    expect(cancellationPolicyDecision({
      startAt,
      requestedAt: new Date('2026-08-21T17:30:00.000Z'),
      accessType: 'COMPLIMENTARY',
      isEvent: false,
      hasReservedCredit: false,
    })).toMatchObject({ feeCents: 0, status: 'LATE_CANCELLED' });
  });
});
