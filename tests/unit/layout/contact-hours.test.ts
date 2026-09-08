import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('contact address and hours layout', () => {
  const contactSource = readFileSync('app/contact/page.tsx', 'utf8');
  const footerSource = readFileSync('components/layout/Footer.tsx', 'utf8');
  const locationSource = readFileSync(
    'components/sections/LocationBlock.tsx',
    'utf8',
  );

  it('shows the building identifier on the contact page', () => {
    expect(contactSource).toContain('{site.address.line3}');
    expect(locationSource).toContain('{site.address.line3}');
  });

  it('keeps day and time columns compact on contact and in the footer', () => {
    expect(contactSource).toContain(
      'grid grid-cols-[4.5rem_auto] gap-x-3',
    );
    expect(footerSource).toContain(
      'grid grid-cols-[4.5rem_auto] gap-x-3',
    );
    expect(locationSource).toContain(
      'grid grid-cols-[4.5rem_auto] gap-x-3',
    );
    expect(footerSource).not.toContain(
      'className="flex justify-between gap-5"',
    );
  });
});
