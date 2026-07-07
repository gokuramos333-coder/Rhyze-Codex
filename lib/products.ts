export type Product = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  sizes: string[];
  description: string;
  comingSoon?: boolean;
};

export const products: Product[] = [
  {
    id: 'rhyze-cropped-tee-cream',
    name: 'Rhyze Cropped Tee (Cream)',
    price: 35,
    image: '/shop/merch-1.png',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Soft cream cotton, cropped silhouette, and a subtle gradient Rhyze mark on the chest. A studio-to-sidewalk staple.',
  },
  {
    id: 'rhyze-tribe-cropped-tee-black',
    name: 'Rhyze Tribe Cropped Tee (Black)',
    price: 35,
    image: '/shop/merch-2.png',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Blackout cropped tee repping the Rhyze Tribe. Gentle stretch, breathable feel, and the heavy-hitter look of our opening season.',
  },
  {
    id: 'flow-over-force-cropped-tee-grey',
    name: 'Flow Over Force Cropped Tee (Grey)',
    price: 35,
    image: '/shop/merch-3.png',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Heather grey cropped tee with our "Flow Over Force" mantra echoed in fading layers and the Rhyze mark front and center. Soft, breathable, and built to move.',
  },
  {
    id: 'mind-body-soul-cropped-tee-black',
    name: 'Mind · Body · Soul Cropped Tee (Black)',
    price: 35,
    image: '/shop/merch-4.png',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Black cropped tee with our three-line manifesto, Elevate your mind, Energize your body, Evolve your soul, in cream and Rhyze coral. Wear the intention.',
  },
  {
    id: 'rhyze-tribe-boxy-tee-sand',
    name: 'Rhyze Tribe Boxy Tee (Sand)',
    price: 35,
    image: '/shop/merch-5.png',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Relaxed boxy fit in warm sand with the Rhyze Tribe block print. Cap sleeves, drapey shoulder, soft hand-feel, the off-day pick of the capsule.',
  },
  {
    id: 'rhyze-up-dad-hat',
    name: 'Rhyze Hat',
    price: 35,
    image: null,
    sizes: ['One Size'],
    description:
      'Structured six-panel dad hat with embroidered Rhyze wordmark. A drop coming soon.',
    comingSoon: true,
  },
];

export const getProduct = (id: string) => products.find((p) => p.id === id);
