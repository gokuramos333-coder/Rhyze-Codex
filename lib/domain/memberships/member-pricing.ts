import type Stripe from 'stripe';

export type MemberPricingInput = {
  monthlyPrice?: string;
  discountDuration?: string;
  discountMonths?: string;
  discountReason?: string;
};
export type MemberPricing = {
  monthlyCents: number;
  regularCents: number;
  amountOff: number;
  duration: 'forever' | 'repeating';
  months: number | null;
  reason: string;
};

export function parseMemberPricing(
  input: MemberPricingInput,
  regularCents: number,
): MemberPricing | null {
  const value = input.monthlyPrice?.trim();
  if (!value) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw Error('Enter a monthly price with at most two decimal places.');
  const monthlyCents = Math.round(Number(value) * 100);
  if (
    !Number.isSafeInteger(monthlyCents) ||
    monthlyCents < 100 ||
    monthlyCents > regularCents
  )
    throw Error(
      'The client price must be at least $1 and no higher than the regular monthly price.',
    );
  const reason = input.discountReason?.trim() || '';
  if (reason.length < 3 || reason.length > 240)
    throw Error('Add a pricing reason (3–240 characters).');
  const duration = input.discountDuration;
  if (!['forever', 'repeating'].includes(duration || ''))
    throw Error('Choose how long the client price lasts.');
  const months = duration === 'repeating' ? Number(input.discountMonths) : null;
  if (
    months !== null &&
    (!/^\d+$/.test(input.discountMonths || '') ||
      !Number.isInteger(months) ||
      months < 1 ||
      months > 36)
  )
    throw Error('Choose 1–36 months for the discount.');
  return {
    monthlyCents,
    regularCents,
    amountOff: regularCents - monthlyCents,
    duration: duration as MemberPricing['duration'],
    months,
    reason,
  };
}

export function memberPricingLabel(pricing: MemberPricing) {
  if (!pricing.amountOff)
    return `Regular price: $${(pricing.regularCents / 100).toFixed(2)}/month`;
  return `$${(pricing.monthlyCents / 100).toFixed(2)}/month ${pricing.duration === 'forever' ? 'until changed' : `for ${pricing.months} month${pricing.months === 1 ? '' : 's'} from activation; then $${(pricing.regularCents / 100).toFixed(2)}/month`}`;
}

export function memberCouponParams(
  pricing: MemberPricing,
  userId: string,
  productId: string,
  stripeProduct: string,
): Stripe.CouponCreateParams {
  if (!pricing.amountOff)
    throw Error('Regular pricing does not require a coupon.');
  return {
    amount_off: pricing.amountOff,
    currency: 'usd',
    duration: pricing.duration,
    ...(pricing.months ? { duration_in_months: pricing.months } : {}),
    max_redemptions: 1,
    applies_to: { products: [stripeProduct] },
    name: 'Rhyze client membership price',
    metadata: { source: 'RHYZE_MEMBER_PRICING', userId, productId },
  };
}
