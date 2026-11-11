/** Commercial discount arithmetic only. Birthday gifts belong to a separate
 * class/event recipient entitlement, never a membership or package campaign.
 * Persistence, admission and provider integration are separate gates. */
export type DiscountValue =
  | { kind: 'PERCENT'; percentOff: number }
  | { kind: 'FIXED'; amountOffCents: number };

export function calculateDiscountCents(priceCents: number, value: DiscountValue): number {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) throw Error('Price must be nonnegative safe integer cents.');
  if (value.kind === 'FIXED') {
    if (!Number.isSafeInteger(value.amountOffCents) || value.amountOffCents <= 0) throw Error('Fixed discount must be positive safe integer cents.');
    return Math.min(priceCents, value.amountOffCents);
  }
  if (value.kind !== 'PERCENT' || !Number.isInteger(value.percentOff) || value.percentOff < 1 || value.percentOff > 99) throw Error('Commercial percentage must be an integer from 1 to 99.');
  // Multiply as integers, including above Number's exact multiplication range.
  // Preserve existing positive half-up rounding; never round whole dollars.
  return Number((BigInt(priceCents) * BigInt(value.percentOff) + BigInt(50)) / BigInt(100));
}

/** Strict decimal USD input, bounded to PostgreSQL/Prisma signed Int cents. */
export function parseDollarDiscount(value: string): number {
  if (!/^(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?$/.test(value)) throw Error('Use a positive dollar amount with at most two decimal places.');
  const [dollars, fraction = ''] = value.split('.');
  const cents = BigInt(dollars) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (cents < BigInt(1) || cents > BigInt(2147483647)) throw Error('Dollar amount is outside supported integer cents.');
  return Number(cents);
}

export function quoteDiscountValue(priceCents: number, value: DiscountValue, billingInterval: 'ONE_TIME' | 'MONTHLY') {
  if (billingInterval !== 'ONE_TIME' && billingInterval !== 'MONTHLY') throw Error('Unsupported discount billing interval.');
  const discountCents = calculateDiscountCents(priceCents, value);
  const amountCents = priceCents - discountCents;
  // Do not turn memberships or packages into birthday gifts by another spelling.
  if (amountCents === 0) throw Error('Zero-total commercial discounts are not supported; gifts use the separate class/event area.');
  return { discountCents, amountCents };
}
