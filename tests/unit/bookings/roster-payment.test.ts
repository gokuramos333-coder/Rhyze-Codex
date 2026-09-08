import { describe, expect, it } from 'vitest';
import { rosterPaymentDetails } from '@/lib/domain/bookings/roster-payment';

describe('roster payment details', () => {
  it('identifies intro trial access', () => {
    expect(rosterPaymentDetails({
      bookingSource: 'MEMBER',
      currentPlanName: 'Intro Offer 7-Days',
      currentPlanKind: 'INTRO_TRIAL',
      reservedCreditLabel: null,
    })).toEqual({ paymentMethod: '$7 intro trial', currentPlan: 'Intro Offer 7-Days' });
  });

  it('identifies a membership credit and its plan', () => {
    expect(rosterPaymentDetails({
      bookingSource: 'MEMBER',
      currentPlanName: 'Elevate',
      currentPlanKind: 'LIMITED_MEMBERSHIP',
      reservedCreditLabel: 'Elevate',
    })).toEqual({ paymentMethod: 'Membership credit', currentPlan: 'Elevate' });
  });

  it('uses the reserved single-class credit instead of a stale current intro plan', () => {
    expect(rosterPaymentDetails({
      bookingSource: 'MEMBER',
      currentPlanName: 'Intro Offer 7-Days',
      currentPlanKind: 'INTRO_TRIAL',
      reservedCreditLabel: 'Single Class',
    })).toEqual({ paymentMethod: 'Single-class credit', currentPlan: 'Intro Offer 7-Days' });
  });

  it('identifies direct specialty-event payment', () => {
    expect(rosterPaymentDetails({
      bookingSource: 'STRIPE_EVENT',
      currentPlanName: null,
      currentPlanKind: null,
      reservedCreditLabel: null,
    })).toEqual({ paymentMethod: 'Single event purchase', currentPlan: 'No active plan' });
  });

  it('preserves the imported Somble access type instead of inventing a retail class price', () => {
    expect(rosterPaymentDetails({
      bookingSource: 'SOMBLE_IMPORT',
      currentPlanName: 'Intro Offer 7-Days',
      currentPlanKind: 'INTRO_TRIAL',
      reservedCreditLabel: null,
      importedAccessType: 'Intro Offer 7-Days',
    })).toEqual({
      paymentMethod: 'Somble · Intro Offer 7-Days',
      currentPlan: 'Intro Offer 7-Days',
    });
  });
});
