import { describe, expect, it } from 'vitest';
import { products, STUDIO_AVAILABILITY_LABEL } from '@/lib/products';

describe('shop merchandise catalog', () => {
  it('lists the five studio-available front/back sets before coming-soon items', () => {
    const available = products.filter((product) => !product.comingSoon);
    const firstComingSoonIndex = products.findIndex((product) => product.comingSoon);

    expect(available.map((product) => product.id)).toEqual([
      'rhyze-up-cropped-tank',
      'rhyze-logo-cropped-tee-mauve',
      'mind-body-soul-cropped-tank',
      'rhyze-tribe-cropped-tank-black',
      'rhyze-logo-cropped-tank-black',
    ]);
    expect(available.every((product) => Boolean(product.backImage))).toBe(true);
    expect(available.every((product) => product.availabilityLabel === STUDIO_AVAILABILITY_LABEL)).toBe(true);
    expect(firstComingSoonIndex).toBe(available.length);
    expect(products.slice(firstComingSoonIndex).every((product) => product.comingSoon)).toBe(true);
  });

  it('prices available tanks at $25 and short-sleeve shirts at $30', () => {
    const available = products.filter((product) => !product.comingSoon);
    const tankPrices = available
      .filter((product) => product.kind === 'TANK')
      .map((product) => product.price);
    const shirtPrices = available
      .filter((product) => product.kind === 'SHORT_SLEEVE')
      .map((product) => product.price);

    expect(tankPrices).toEqual([25, 25, 25, 25]);
    expect(shirtPrices).toEqual([30]);
  });

  it('keeps every coming-soon item at $30 and includes the #9/#10 image pair', () => {
    const comingSoon = products.filter((product) => product.comingSoon);
    const blackTee = comingSoon.find(
      (product) => product.id === 'rhyze-logo-cropped-tee-black',
    );

    expect(comingSoon.length).toBeGreaterThan(1);
    expect(comingSoon.every((product) => product.price === 30)).toBe(true);
    expect(blackTee).toMatchObject({
      image: '/shop/rhyze-logo-black-tee-front.webp',
      backImage: '/shop/rhyze-logo-black-tee-back.webp',
      kind: 'SHORT_SLEEVE',
      comingSoon: true,
    });
  });
});
