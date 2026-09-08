import type { ProductKind } from '@prisma/client';

export function rosterPaymentDetails(input: {
  bookingSource: string;
  currentPlanName: string | null;
  currentPlanKind: ProductKind | null;
  reservedCreditLabel: string | null;
  importedAccessType?: string | null;
}) {
  const currentPlan = input.currentPlanName || 'No active plan';
  if (input.bookingSource.startsWith('SOMBLE')) {
    return {
      paymentMethod: input.importedAccessType
        ? `Somble · ${input.importedAccessType}`
        : 'Somble transfer',
      currentPlan,
    };
  }
  if (input.bookingSource === 'STRIPE_EVENT') {
    return { paymentMethod: 'Single event purchase', currentPlan };
  }
  if (input.reservedCreditLabel) {
    const single = /single class|drop.?in/i.test(input.reservedCreditLabel);
    return {
      paymentMethod: single ? 'Single-class credit' : 'Membership credit',
      currentPlan,
    };
  }
  if (input.currentPlanKind === 'INTRO_TRIAL') {
    return { paymentMethod: '$7 intro trial', currentPlan };
  }
  return { paymentMethod: 'Account access', currentPlan };
}
