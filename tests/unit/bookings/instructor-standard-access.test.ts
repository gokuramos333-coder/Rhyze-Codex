import { describe, expect, it } from 'vitest';
import { instructorStandardClassAccess, complimentaryStandardAccessCanBook, COMPLIMENTARY_STANDARD_PLAN } from '@/lib/domain/bookings/booking-rules';

describe('ongoing approved instructor standard-class access', () => {
  const instructor = { role: 'INSTRUCTOR', status: 'ACTIVE', instructorProfile: { isActive: true } };
  it('permits approved active instructors without a date restriction', () => {
    expect(instructorStandardClassAccess({ user: instructor, isEvent: false })).toBe(true);
  });
  it('never includes events', () => {
    expect(instructorStandardClassAccess({ user: instructor, isEvent: true })).toBe(false);
  });
  it('includes an owner who is also an approved active instructor, not every owner', () => {
    expect(instructorStandardClassAccess({ user: { ...instructor, role: 'OWNER' }, isEvent: false })).toBe(true);
    expect(instructorStandardClassAccess({ user: { ...instructor, role: 'OWNER', instructorProfile: null }, isEvent: false })).toBe(false);
  });
  it('rejects revoked, suspended, unapproved, and ordinary member accounts', () => {
    for (const user of [null, { ...instructor, role: 'MEMBER' }, { ...instructor, status: 'INVITED' }, { ...instructor, status: 'SUSPENDED' }, { ...instructor, instructorProfile: null }, { ...instructor, instructorProfile: { isActive: false } }]) {
      expect(instructorStandardClassAccess({ user, isEvent: false })).toBe(false);
    }
  });
  it('complimentary regular-class plans cover 30-minute classes but no events', () => {
    expect(complimentaryStandardAccessCanBook({ customPlanType: COMPLIMENTARY_STANDARD_PLAN, isEvent: false, durationMinutes: 30 })).toBe(true);
    expect(complimentaryStandardAccessCanBook({ customPlanType: COMPLIMENTARY_STANDARD_PLAN, isEvent: true, durationMinutes: 50 })).toBe(false);
  });
});
