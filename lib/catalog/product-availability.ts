type ProductAvailability = {
  isActive: boolean;
  isPublic: boolean;
  alwaysAvailable: boolean;
  availabilityStart: Date | null;
  availabilityEnd: Date | null;
  kind?: string;
  priceCents?: number;
};

const INTRO_TRIAL_AVAILABLE_NOW = new Date('2026-07-30T04:00:00.000Z');

function effectiveAvailabilityStart(
  product: Omit<ProductAvailability, 'isPublic'>,
) {
  return product.kind === 'INTRO_TRIAL' && product.priceCents === 700
    ? INTRO_TRIAL_AVAILABLE_NOW
    : product.availabilityStart;
}

export function isProductAvailable(
  product: ProductAvailability,
  now = new Date(),
) {
  return product.isPublic && isProductActiveInWindow(product, now);
}

export function isProductActiveInWindow(
  product: Omit<ProductAvailability, 'isPublic'>,
  now = new Date(),
) {
  if (!product.isActive) return false;
  if (product.alwaysAvailable) return true;
  const availabilityStart = effectiveAvailabilityStart(product);
  if (availabilityStart && availabilityStart > now) return false;
  if (product.availabilityEnd && product.availabilityEnd < now) return false;
  return true;
}

export function productAvailabilityMessage(
  product: ProductAvailability,
  now = new Date(),
): string | null {
  const availabilityStart = effectiveAvailabilityStart(product);
  if (
    product.isActive &&
    product.isPublic &&
    !product.alwaysAvailable &&
    availabilityStart &&
    availabilityStart > now
  ) {
    return `Available ${availabilityStart.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: 'long',
      day: 'numeric',
    })}`;
  }
  return null;
}
