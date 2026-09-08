import { describe, expect, it } from 'vitest';
import {
  applyEmailCopyOverride,
  replaceSampleValuesWithPlaceholders,
} from '@/lib/notifications/email-template-overrides';
import type { EmailPresentation } from '@/lib/notifications/email-templates';

const base: EmailPresentation = {
  eyebrow: 'Spot confirmed',
  headline: 'You’re on the floor',
  greeting: 'Hi Gui,',
  paragraphs: ['Your Pilates Pulse spot is confirmed.'],
  facts: [{ label: 'Class', value: 'Pilates Pulse' }],
  callout: { title: 'Need help?', body: 'Reply to Melissa.' },
  cta: { label: 'View booking', href: '/member/bookings' },
  closing: 'See you soon.',
};

describe('email copy overrides', () => {
  it('merges edited copy while preserving functional facts and CTA destination', () => {
    const result = applyEmailCopyOverride(base, { name: 'Gui', className: 'Pilates Pulse' }, {
      eyebrow: 'Your class is ready',
      headline: '{{className}} is confirmed',
      greeting: 'Hey {{name}}!',
      paragraphs: ['Bring water.', 'Come ready to move, {{name}}.'],
      ctaLabel: 'See my booking',
    });

    expect(result).toEqual({
      ...base,
      eyebrow: 'Your class is ready',
      headline: 'Pilates Pulse is confirmed',
      greeting: 'Hey Gui!',
      paragraphs: ['Bring water.', 'Come ready to move, Gui.'],
      cta: { label: 'See my booking', href: '/member/bookings' },
    });
  });

  it('keeps unknown placeholders visible for Admin review', () => {
    const result = applyEmailCopyOverride(base, {}, { headline: 'Hi {{missingName}}' });
    expect(result.headline).toBe('Hi {{missingName}}');
  });

  it('turns sample recipient values back into reusable placeholders before saving', () => {
    expect(replaceSampleValuesWithPlaceholders('Hello Gui — Pilates Pulse is ready.', {
      name: 'Gui',
      className: 'Pilates Pulse',
    })).toBe('Hello {{name}} — {{className}} is ready.');
  });
});
