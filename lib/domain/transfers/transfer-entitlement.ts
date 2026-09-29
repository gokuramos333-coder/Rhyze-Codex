import { instructorStandardClassAccess } from '@/lib/domain/bookings/booking-rules';
import { giftedVipThrough, vipCreditBenefit, vipMembershipPaidThrough, type VipEntitlementMembership } from '@/lib/domain/credits/vip-access';
import { bookingAccessType } from '@/lib/domain/bookings/booking-access';
import { isAdminAssignment, manualAssignmentWindowAllows } from '@/lib/domain/credits/manual-assignment-access';

export function transferBookingAccessType(input: {
  policySnapshot: unknown;
  bookingSource: string;
  reservation: { creditAccount: { label: string; sourcePurchase?: { product: { kind: string } } | null } } | null;
  memberships: { status: string; product: { kind: string; customPlanType?: string | null } }[];
}) {
  const snapshot = input.policySnapshot as Record<string, unknown> | null;
  const reserved = input.reservation?.creditAccount;
  const standardProof = snapshot?.creditAccountId || snapshot?.accessProductKind || reserved;
  const explicitStandardComp = input.memberships.some(m => m.status === 'ACTIVE' && m.product.customPlanType === 'COMPLIMENTARY_STANDARD');
  const unprovenStandard = snapshot?.accessType === 'STANDARD' && !snapshot.accessProductKind && !snapshot.creditAccountId;
  return bookingAccessType({
    policySnapshot: unprovenStandard && (!standardProof || (reserved && vipCreditBenefit(reserved))) ? null : snapshot,
    bookingSource: input.bookingSource,
    reservedProductKind: reserved ? (vipCreditBenefit(reserved) ? 'VIP' : reserved.sourcePurchase?.product.kind ?? 'STANDARD') : null,
    // Historic VIP rows still matter for unproven legacy bookings after expiry.
    activeProductKinds: explicitStandardComp ? ['MONTHLY_UNLIMITED'] : input.memberships.map(m => m.product.kind),
  });
}

export function transferEntitlementAllowed(input: {
  accessType: string;
  creditAccountId?: string | null;
  user: { role: string; status: string; instructorProfile: { isActive: boolean } | null; memberships: VipEntitlementMembership[] };
  sourceIsEvent: boolean;
  destinationIsEvent: boolean;
  destinationStartsAt: Date;
  now: Date;
}) {
  if (input.user.status !== 'ACTIVE' || input.sourceIsEvent !== input.destinationIsEvent) return false;
  const assigned = input.creditAccountId && input.user.memberships.find(m =>
    m.purchase?.creditAccount?.id === input.creditAccountId && isAdminAssignment(m.purchase?.policyAcceptance));
  if (assigned) {
    return assigned.status === 'ACTIVE' && assigned.purchase?.status === 'PAID' &&
      !(assigned.product.customPlanType === 'COMPLIMENTARY_STANDARD' && input.destinationIsEvent) &&
      manualAssignmentWindowAllows({
        policyAcceptance: assigned.purchase.policyAcceptance,
        validFrom: assigned.purchase.creditAccount?.validFrom,
        validUntil: assigned.purchase.creditAccount?.validUntil,
        membershipEnd: assigned.currentPeriodEnd,
        now: input.now, occurrenceStartsAt: input.destinationStartsAt,
      });
  }
  if (input.accessType === 'VIP') return input.user.memberships.some(m => {
    const end = vipMembershipPaidThrough(m, input.now) ?? (!input.destinationIsEvent ? giftedVipThrough(m, input.now) : null);
    return end && input.destinationStartsAt < end;
  });
  if (input.accessType === 'COMPLIMENTARY') return input.user.role === 'OWNER' ||
    instructorStandardClassAccess({ user: input.user, isEvent: input.destinationIsEvent });
  return true;
}
