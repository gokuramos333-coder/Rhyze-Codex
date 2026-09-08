export const ERIKA_GIFTED_VIP = {
  email: 'erikamun78@gmail.com',
  planName: 'UNLIMITED CREDITS VIP',
  productSlug: 'erika-rivera-gifted-vip',
  validUntil: new Date('2027-02-02T04:59:59.999Z'),
  isUnlimited: true,
  isPublic: false,
} as const;

const ERIKA_GIFTED_VIP_NOTE =
  'Gifted VIP access · Unlimited standard classes through February 1, 2027.';

export function isErikaGiftedVip(productSlug: string | null | undefined) {
  return productSlug === ERIKA_GIFTED_VIP.productSlug;
}

export function giftedVipAccessNote(productSlug: string | null | undefined) {
  return isErikaGiftedVip(productSlug) ? ERIKA_GIFTED_VIP_NOTE : null;
}
