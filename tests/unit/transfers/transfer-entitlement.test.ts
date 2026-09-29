import { describe, expect, it } from 'vitest';
import { transferBookingAccessType, transferEntitlementAllowed } from '@/lib/domain/transfers/transfer-entitlement';

const now = new Date('2026-09-21T16:00Z');
const user = { role: 'INSTRUCTOR', status: 'ACTIVE', instructorProfile: { isActive: true }, memberships: [] };
describe('transfers cannot bypass the original entitlement', () => {
  it('keeps a standard-class manual assignment inside its original window during transfer', () => {
    const start = new Date('2026-09-29T17:00Z');
    const end = new Date('2027-02-02T04:59:59.999Z');
    const membership = { id: 'manual', userId: 'member', purchaseId: 'gift', status: 'ACTIVE', currentPeriodEnd: end,
      product: { kind: 'MONTHLY_UNLIMITED', customPlanType: 'COMPLIMENTARY_STANDARD' },
      purchase: { status: 'PAID', paidAt: start, policyAcceptance: { source: 'ADMIN_ASSIGNMENT', accessEndsAt: end.toISOString() },
        creditAccount: { id: 'gift-credit', isUnlimited: true, validFrom: start, validUntil: end } } };
    const input = { accessType: 'STANDARD', creditAccountId: 'gift-credit', user: { ...user, role: 'MEMBER', memberships: [membership] },
      sourceIsEvent: false, destinationIsEvent: false, destinationStartsAt: new Date('2027-02-01T17:00Z'), now: start };
    expect(transferEntitlementAllowed(input)).toBe(true);
    expect(transferEntitlementAllowed({ ...input, destinationStartsAt: end })).toBe(false);
    expect(transferEntitlementAllowed({ ...input, destinationStartsAt: new Date(start.getTime() - 1) })).toBe(false);
    expect(transferEntitlementAllowed({ ...input, now: end })).toBe(false);
    expect(transferEntitlementAllowed({ ...input, user: { ...input.user, memberships: [{ ...membership, status: 'PAUSED' }] } })).toBe(false);
    // An independent purchased credit keeps its existing transfer policy.
    expect(transferEntitlementAllowed({ ...input, creditAccountId: 'paid-credit', destinationStartsAt: end })).toBe(true);
  });
  it('treats unproven legacy STANDARD snapshots with historic VIP benefits as VIP, but preserves actual finite/manual credits', () => {
    const input = { policySnapshot: { accessType: 'STANDARD', accessProductKind: null }, bookingSource: 'MEMBER',
      reservation: null, memberships: [{ product: { kind: 'VIP' }, status: 'EXPIRED' }] };
    expect(transferBookingAccessType(input)).toBe('VIP');
    expect(transferBookingAccessType({ ...input, reservation: { creditAccount: { label: 'Manual class credit', sourcePurchase: null } } })).toBe('STANDARD');
    expect(transferBookingAccessType({ ...input, reservation: { creditAccount: { label: 'VIP complimentary event credit', sourcePurchase: null } } })).toBe('VIP');
    expect(transferBookingAccessType({ ...input, policySnapshot: { ...input.policySnapshot, creditAccountId: 'manual' } })).toBe('STANDARD');
    expect(transferBookingAccessType({ ...input, memberships: [...input.memberships, { status: 'ACTIVE', product: { kind: 'MONTHLY_UNLIMITED', customPlanType: 'COMPLIMENTARY_STANDARD' } }] })).toBe('STANDARD');
  });
  it('preserves only the exact bounded Erika gift for regular classes', () => {
    const membership = { id: 'rhyze-erika-gifted-vip-membership-2026', userId: 'erika', purchaseId: null, status: 'ACTIVE',
      currentPeriodEnd: new Date('2027-02-02T04:59:59.999Z'), product: { kind: 'VIP', slug: 'erika-rivera-gifted-vip' } };
    const input = { accessType: 'VIP', user: { ...user, role: 'MEMBER', memberships: [membership] },
      sourceIsEvent: false, destinationIsEvent: false, destinationStartsAt: new Date('2026-10-01T16:00Z'), now };
    expect(transferEntitlementAllowed(input)).toBe(true);
    expect(transferEntitlementAllowed({ ...input, sourceIsEvent: true, destinationIsEvent: true })).toBe(false);
    expect(transferEntitlementAllowed({ ...input, destinationStartsAt: membership.currentPeriodEnd })).toBe(false);
    expect(transferEntitlementAllowed({ ...input, user: { ...input.user, memberships: [{ ...membership, id: 'another-free-vip' }] } })).toBe(false);
  });
  it('does not convert a free regular class into an event', () => {
    expect(transferEntitlementAllowed({ accessType: 'COMPLIMENTARY', user, sourceIsEvent: false, destinationIsEvent: true, destinationStartsAt: now, now })).toBe(false);
  });
  it('rejects expired unpaid VIP transfer access', () => {
    expect(transferEntitlementAllowed({ accessType: 'VIP', user, sourceIsEvent: false, destinationIsEvent: false, destinationStartsAt: now, now })).toBe(false);
  });
  it('allows a still-approved instructor regular class and rejects a revoked profile', () => {
    const input = { accessType: 'COMPLIMENTARY', user, sourceIsEvent: false, destinationIsEvent: false, destinationStartsAt: now, now };
    expect(transferEntitlementAllowed(input)).toBe(true);
    expect(transferEntitlementAllowed({ ...input, user: { ...user, role: 'MEMBER', instructorProfile: null } })).toBe(false);
  });
});
