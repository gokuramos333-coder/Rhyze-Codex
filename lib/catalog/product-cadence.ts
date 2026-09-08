import type { BillingInterval } from '@prisma/client';

export type ProductCadence = {
  billingInterval: BillingInterval;
  customPlanType?: string | null;
};

export const QUARTERLY_8_CLASS_PACK = 'QUARTERLY_8_CLASS_PACK';

export function productCheckoutCadence(product: ProductCadence) {
  if (product.customPlanType === QUARTERLY_8_CLASS_PACK) {
    return { label: '/ 3 months', stripeIntervalCount: 3 };
  }
  if (product.billingInterval === 'MONTHLY') return { label: '/month', stripeIntervalCount: 1 };
  if (product.billingInterval === 'YEARLY') return { label: '/year', stripeIntervalCount: 1 };
  return { label: '', stripeIntervalCount: 1 };
}
