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
    price: 30,
    image: '/shop/merch-1.png',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Soft cream cotton, cropped silhouette, and a subtle gradient Rhyze mark on the chest. A studio-to-sidewalk staple.',
  },
  {
    id: 'rhyze-tribe-cropped-tee-black',
    name: 'Rhyze Tribe Cropped Tee (Black)',
    price: 30,
    image: '/shop/merch-2.png',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    description:
      'Blackout cropped tee repping the Rhyze Tribe. Gentle stretch, breathable feel, and the heavy-hitter look of our opening season.',
  },
  {
    id: 'rhyze-up-dad-hat',
    name: 'Rhyze Up Dad Hat',
    price: 35,
    image: null,
    sizes: ['One Size'],
    description:
      'Structured six-panel dad hat with embroidered Rhyze wordmark. A drop coming soon.',
    comingSoon: true,
  },
];

export const getProduct = (id: string) => products.find((p) => p.id === id);
