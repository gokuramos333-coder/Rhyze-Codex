import { describe, expect, it } from 'vitest';
import { bookingAccessType } from '@/lib/domain/bookings/booking-access';

describe('booking access classification', () => {
  it('uses the booking-time access snapshot before current memberships', () => {
    expect(bookingAccessType({
      policySnapshot: { accessProductKind: 'INTRO_TRIAL' },
      bookingSource: 'MEMBER',
      reservedProductKind: null,
      activeProductKinds: ['VIP'],
    })).toBe('INTRO_TRIAL');
  });

  it('uses the reserved paid credit when an older booking has no snapshot', () => {
    expect(bookingAccessType({
      policySnapshot: null,
      bookingSource: 'MEMBER',
      reservedProductKind: 'DROP_IN',
      activeProductKinds: ['VIP'],
    })).toBe('STANDARD');
  });

  it('prefers VIP then intro trial for legacy unlimited bookings', () => {
    expect(bookingAccessType({
      policySnapshot: null,
      bookingSource: 'MEMBER',
      reservedProductKind: null,
      activeProductKinds: ['INTRO_TRIAL', 'VIP'],
    })).toBe('VIP');
    expect(bookingAccessType({
      policySnapshot: null,
      bookingSource: 'MEMBER',
      reservedProductKind: null,
      activeProductKinds: ['INTRO_TRIAL'],
    })).toBe('INTRO_TRIAL');
  });

  it('never charges owner complimentary bookings', () => {
    expect(bookingAccessType({
      policySnapshot: null,
      bookingSource: 'OWNER_COMPLIMENTARY',
      reservedProductKind: null,
      activeProductKinds: ['VIP'],
    })).toBe('COMPLIMENTARY');
  });
});
