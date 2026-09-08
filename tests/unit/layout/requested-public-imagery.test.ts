import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('requested public imagery', () => {
  it('uses the supplied imagery on the choreography and about surfaces', () => {
    const pillars = readFileSync('components/sections/ThreePillars.tsx', 'utf8');
    const choreography = readFileSync('app/event-choreography/page.tsx', 'utf8');
    const about = readFileSync('app/about/page.tsx', 'utf8');

    expect(pillars).toContain('/founders/event-choreography-card.png');
    expect(choreography).toContain('/founders/event-choreography-page.png');
    expect(about).toContain('/founders/come-as-you-are.jpg');
    expect(about).toContain('aspect-[3/2]');
    expect(about).toContain('className="object-contain"');
    expect(about).toContain('order-2 relative aspect-[3/2]');
    expect(about).toContain('order-1 lg:order-1');
  });
});
