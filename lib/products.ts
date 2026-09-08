export const STUDIO_AVAILABILITY_LABEL = 'Available at the studio in person';

export type ProductKind = 'TANK' | 'SHORT_SLEEVE' | 'ACCESSORY';

export type Product = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  backImage?: string | null;
  sizes: string[];
  description: string;
  kind: ProductKind;
  availabilityLabel?: string;
  comingSoon?: boolean;
};

export const products: Product[] = [
  {
    id: 'rhyze-up-cropped-tank',
    name: 'Rhyze Up Cropped Tank',
    price: 25,
    image: '/shop/rhyze-up-tank-front.webp',
    backImage: '/shop/rhyze-up-tank-back.webp',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Black cropped tank with the Rhyze Up mantra in the studio gradient. Lightweight, breathable, and ready to move.',
    kind: 'TANK',
    availabilityLabel: STUDIO_AVAILABILITY_LABEL,
  },
  {
    id: 'rhyze-logo-cropped-tee-mauve',
    name: 'Rhyze Logo Cropped Tee (Mauve)',
    price: 30,
    image: '/shop/rhyze-logo-mauve-tee-front.webp',
    backImage: '/shop/rhyze-logo-mauve-tee-back.webp',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Soft mauve short-sleeve cropped tee finished with the signature Rhyze logo in coral and gold.',
    kind: 'SHORT_SLEEVE',
    availabilityLabel: STUDIO_AVAILABILITY_LABEL,
  },
  {
    id: 'mind-body-soul-cropped-tank',
    name: 'Mind · Body · Soul Cropped Tank',
    price: 25,
    image: '/shop/mind-body-soul-tank-front.webp',
    backImage: '/shop/mind-body-soul-tank-back.webp',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Black cropped tank featuring the Rhyze manifesto: Elevate your mind, Energize your body, Evolve your soul.',
    kind: 'TANK',
    availabilityLabel: STUDIO_AVAILABILITY_LABEL,
  },
  {
    id: 'rhyze-tribe-cropped-tank-black',
    name: 'Rhyze Tribe Cropped Tank',
    price: 25,
    image: '/shop/rhyze-tribe-tank-front.webp',
    backImage: '/shop/rhyze-tribe-tank-back.webp',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Black racerback cropped tank with the bold Rhyze Tribe mark. A high-energy studio favorite.',
    kind: 'TANK',
    availabilityLabel: STUDIO_AVAILABILITY_LABEL,
  },
  {
    id: 'rhyze-logo-cropped-tank-black',
    name: 'Rhyze Logo Cropped Tank',
    price: 25,
    image: '/shop/rhyze-logo-tank-front.webp',
    backImage: '/shop/rhyze-logo-tank-back.webp',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Black cropped tank centered with the full Rhyze mark in white, coral, and gold.',
    kind: 'TANK',
    availabilityLabel: STUDIO_AVAILABILITY_LABEL,
  },
  {
    id: 'rhyze-logo-cropped-tee-black',
    name: 'Rhyze Logo Cropped Tee (Black)',
    price: 30,
    image: '/shop/rhyze-logo-black-tee-front.webp',
    backImage: '/shop/rhyze-logo-black-tee-back.webp',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Black short-sleeve cropped tee with the signature Rhyze logo in the studio gradient.',
    kind: 'SHORT_SLEEVE',
    comingSoon: true,
  },
  {
    id: 'rhyze-cropped-tee-cream',
    name: 'Rhyze Cropped Tee (Cream)',
    price: 30,
    image: '/shop/merch-1.png',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Soft cream cotton, cropped silhouette, and a subtle gradient Rhyze mark on the chest. A studio-to-sidewalk staple.',
    kind: 'SHORT_SLEEVE',
    comingSoon: true,
  },
  {
    id: 'rhyze-tribe-cropped-tee-black',
    name: 'Rhyze Tribe Cropped Tee (Black)',
    price: 30,
    image: '/shop/merch-2.png',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Blackout cropped tee repping the Rhyze Tribe. Gentle stretch, breathable feel, and the heavy-hitter look of our opening season.',
    kind: 'SHORT_SLEEVE',
    comingSoon: true,
  },
  {
    id: 'flow-over-force-cropped-tee-grey',
    name: 'Flow Over Force Cropped Tee (Grey)',
    price: 30,
    image: '/shop/merch-3.png',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Heather grey cropped tee with our "Flow Over Force" mantra echoed in fading layers and the Rhyze mark front and center.',
    kind: 'SHORT_SLEEVE',
    comingSoon: true,
  },
  {
    id: 'mind-body-soul-cropped-tee-black',
    name: 'Mind · Body · Soul Cropped Tee (Black)',
    price: 30,
    image: '/shop/merch-4.png',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Black cropped tee with the Rhyze three-line manifesto in cream and coral. Wear the intention.',
    kind: 'SHORT_SLEEVE',
    comingSoon: true,
  },
  {
    id: 'rhyze-tribe-boxy-tee-sand',
    name: 'Rhyze Tribe Boxy Tee (Sand)',
    price: 30,
    image: '/shop/merch-5.png',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Relaxed boxy fit in warm sand with the Rhyze Tribe block print and a soft, easy-moving feel.',
    kind: 'SHORT_SLEEVE',
    comingSoon: true,
  },
  {
    id: 'rhyze-up-dad-hat',
    name: 'Rhyze Hat',
    price: 30,
    image: null,
    sizes: ['One Size'],
    description:
      'Structured six-panel dad hat with embroidered Rhyze wordmark. A drop coming soon.',
    kind: 'ACCESSORY',
    comingSoon: true,
  },
];

export const getProduct = (id: string) => products.find((product) => product.id === id);
