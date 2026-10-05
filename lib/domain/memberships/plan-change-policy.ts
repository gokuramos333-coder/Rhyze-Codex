import type Stripe from 'stripe';
import { zonedLocalDateTimeToDate } from '@/lib/domain/schedule/recurrence-service';
import { STUDIO_TIME_ZONE } from '@/lib/config/studio';

export function validatePlanChangeProduct(
  product: {
    id: string;
    kind: string;
    billingInterval: string;
    isActive: boolean;
    stripePriceId: string | null;
    priceCents: number;
  },
  currentProductId: string,
) {
  if (product.id === currentProductId)
    throw Error('Choose a different membership.');
  if (
    !product.isActive ||
    !product.stripePriceId ||
    product.priceCents <= 0 ||
    product.billingInterval !== 'MONTHLY' ||
    !['LIMITED_MEMBERSHIP', 'MONTHLY_UNLIMITED', 'VIP'].includes(product.kind)
  ) {
    throw Error(
      'Choose an active paid monthly membership. Trials, class packs and events are separate purchases.',
    );
  }
}

export function changeEffectiveAt(
  timing: string,
  date: string,
  now: Date,
  periodEnd: Date,
) {
  if (periodEnd <= now)
    throw Error(
      'This membership must be paid and current before changing plans.',
    );
  if (timing === 'NEXT_RENEWAL') return periodEnd;
  if (timing === 'NOW')
    return new Date(Math.floor(now.getTime() / 1000) * 1000);
  if (
    timing !== 'DATE' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T12:00Z`).toISOString().slice(0, 10) !== date
  )
    throw Error('Choose a valid start date.');
  const effective = zonedLocalDateTimeToDate(`${date}T00:00`, STUDIO_TIME_ZONE);
  if (effective <= now || effective > periodEnd)
    throw Error(
      'Choose a future day before the next renewal, or select next renewal.',
    );
  return effective;
}

export function immediateChangeParams(
  itemId: string,
  priceId: string,
  at: number,
  resetBillingCycle = false,
): Stripe.SubscriptionUpdateParams {
  return {
    items: [{ id: itemId, price: priceId, quantity: 1 }],
    billing_cycle_anchor: resetBillingCycle ? 'now' : 'unchanged',
    proration_behavior: resetBillingCycle ? 'none' : 'always_invoice',
    payment_behavior: 'pending_if_incomplete',
    ...(!resetBillingCycle ? { proration_date: at } : {}),
    expand: ['latest_invoice'],
  };
}

export function scheduledChangeParams(input: {
  start: number;
  effective: number;
  oldPriceId: string;
  newPriceId: string;
  operationId: string;
}): Stripe.SubscriptionScheduleUpdateParams {
  return {
    end_behavior: 'release',
    proration_behavior: 'none',
    phases: [
      {
        start_date: input.start,
        end_date: input.effective,
        items: [{ price: input.oldPriceId, quantity: 1 }],
        proration_behavior: 'none',
      },
      {
        start_date: input.effective,
        duration: { interval: 'month', interval_count: 1 },
        items: [{ price: input.newPriceId, quantity: 1 }],
        billing_cycle_anchor: 'automatic',
        proration_behavior: 'always_invoice',
        metadata: { rhyzePlanChangeId: input.operationId },
      },
    ],
  };
}

export function planChangeCreditAdjustment(
  balance: number,
  used: number,
  allowance: number | null,
) {
  // Preserve internal overuse debt; callers display spendable credits floored at
  // zero. A later cancellation must not create credits beyond the new allowance.
  return (allowance === null ? 0 : allowance - Math.max(0, used)) - balance;
}
