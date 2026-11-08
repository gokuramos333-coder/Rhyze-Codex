export const TRIAL_UPGRADE_BLOCKER =
  'Checkout unavailable: paid-upfront activation on the first scheduled class (within 14 days) and aligned recurring renewal are not implemented and verified. No checkout or email can be created.';

// This is an offer calculator, never a purchase, provider coupon or entitlement.
export function trialUpgradeTerms(
  input: { mode: string; value: string },
  regularCents: number,
) {
  if (
    !Number.isSafeInteger(regularCents) ||
    regularCents < 100 ||
    !/^\d+(?:\.\d{1,2})?$/.test(input.value.trim())
  )
    throw Error('Enter a valid first-period amount or discount.');
  const value = Number(input.value);
  if (
    !['amount', 'percent'].includes(input.mode) ||
    (input.mode === 'percent' && (value < 0 || value >= 100))
  )
    throw Error('Choose a discount from 0% to less than 100%.');
  const firstCents =
    input.mode === 'amount'
      ? Math.round(value * 100)
      : Math.round((regularCents * (100 - value)) / 100);
  if (
    !Number.isSafeInteger(firstCents) ||
    firstCents < 100 ||
    firstCents > regularCents
  )
    throw Error(
      'The first period must be at least $1 and no more than the regular price.',
    );
  return {
    firstCents,
    recurringCents: regularCents,
    amountOffCents: regularCents - firstCents,
    duration: 'once' as const,
  };
}

export function requireTrialUpgradeCheckout(): never {
  throw Error(TRIAL_UPGRADE_BLOCKER);
}
