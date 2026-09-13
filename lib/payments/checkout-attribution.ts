const CHECKOUT_PLAN_VALUES: Record<string, string> = {
  'intro-offer': 'intro_7day',
  'drop-in': 'single_class',
  elevate: 'elevate',
  ritual: 'ritual',
  'vip-access-pass': 'vip_access',
  'eight-class-pack': 'pack_8',
};

export function checkoutPlanValue(productSlug: string): string {
  return CHECKOUT_PLAN_VALUES[productSlug] ?? productSlug;
}
