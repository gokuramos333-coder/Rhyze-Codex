export const PRIVATE_OG_RHYZE_SLUG = 'og-rhyze-tribe-2026';
export const PRIVATE_OG_RHYZE_PATH = `/memberships/private/${PRIVATE_OG_RHYZE_SLUG}`;

export function canAccessPrivateMembership(
  productSlug: string,
  accessSlug: string | undefined,
) {
  return productSlug === PRIVATE_OG_RHYZE_SLUG && accessSlug === PRIVATE_OG_RHYZE_SLUG;
}
