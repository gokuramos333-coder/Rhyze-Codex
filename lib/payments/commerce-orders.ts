import { getProduct } from '@/lib/products';

export class CommercePricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommercePricingError';
  }
}

export type MerchandiseCheckoutItem = {
  productId: string;
  size: string;
  qty: number;
};

export function priceMerchandiseCart(items: MerchandiseCheckoutItem[]) {
  if (!items.length) throw new CommercePricingError('Your cart is empty.');
  const pricedItems = items.map((item) => {
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10) {
      throw new CommercePricingError('Quantity must be between 1 and 10.');
    }
    const product = getProduct(item.productId);
    if (!product || product.comingSoon || !product.sizes.includes(item.size)) {
      throw new CommercePricingError('Your cart contains an unavailable item.');
    }
    return {
      productReference: product.id,
      name: product.name,
      description: product.description,
      variant: item.size,
      imageUrl: product.image,
      unitAmountCents: Math.round(product.price * 100),
      quantity: item.qty,
    };
  });
  return {
    amountCents: pricedItems.reduce(
      (total, item) => total + item.unitAmountCents * item.quantity,
      0,
    ),
    items: pricedItems,
  };
}

type EventOccurrence = {
  id: string;
  slug?: string;
  name: string;
  isEvent: boolean;
  status: string;
  startAt: Date;
  priceCents: number;
  capacity: number;
  booked: number;
};

export const MOMMY_AND_ME_SLUG = 'mommy-and-me-dennisse';

export function priceEventOrder(
  occurrence: EventOccurrence,
  now = new Date(),
  options: { childCount?: number } = {},
) {
  if (!occurrence.isEvent) {
    throw new CommercePricingError('Only specialty events use event checkout.');
  }
  if (occurrence.status !== 'SCHEDULED') {
    throw new CommercePricingError('This event is not available.');
  }
  if (occurrence.startAt <= now) {
    throw new CommercePricingError('This event has already started.');
  }
  if (occurrence.booked >= occurrence.capacity) {
    throw new CommercePricingError('This event is sold out.');
  }
  if (!Number.isInteger(occurrence.priceCents) || occurrence.priceCents <= 0) {
    throw new CommercePricingError('This event does not have a valid price.');
  }
  const isMommyAndMe = occurrence.slug === MOMMY_AND_ME_SLUG;
  const childCount = options.childCount ?? 1;
  if (
    isMommyAndMe &&
    (!Number.isInteger(childCount) || childCount < 1 || childCount > 5)
  ) {
    throw new CommercePricingError('Choose between 1 and 5 children.');
  }
  const amountCents = isMommyAndMe
    ? occurrence.priceCents + (childCount - 1) * 500
    : occurrence.priceCents;
  const childLabel = childCount === 1 ? 'child' : 'children';
  return {
    amountCents,
    item: {
      productReference: occurrence.id,
      name: occurrence.name,
      description: isMommyAndMe
        ? `Mommy & Me specialty event: 1 parent with ${childCount} ${childLabel}`
        : 'Specialty event ticket',
      variant: isMommyAndMe
        ? `1 parent + ${childCount} ${childLabel}`
        : null,
      imageUrl: null,
      unitAmountCents: amountCents,
      quantity: 1,
    },
  };
}
