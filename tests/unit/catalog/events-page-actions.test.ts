import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('events page actions', () => {
  it('hides the all-events link on the full events page while retaining it on home', () => {
    const previewSource = readFileSync(
      'components/sections/EventsPreview.tsx',
      'utf8',
    );
    const eventsPageSource = readFileSync('app/events/page.tsx', 'utf8');
    const homePageSource = readFileSync('app/page.tsx', 'utf8');

    expect(previewSource).toContain('showAllLink?: boolean');
    expect(previewSource).toContain('{showAllLink && (');
    expect(eventsPageSource).toContain('showAllLink={false}');
    expect(homePageSource).toContain('<EventsPreview />');
  });
});
