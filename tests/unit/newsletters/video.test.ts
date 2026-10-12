import { expect, it } from 'vitest';
import {
  blockSchema,
  documentSchema,
  validateContent,
} from '@/lib/newsletters/domain';
import { renderNewsletter } from '@/lib/newsletters/render';
const document = documentSchema.parse({
  version: 1,
  blocks: [
    blockSchema.parse({
      id: 'video',
      type: 'video',
      url: 'https://vimeo.com/123',
      thumbnailUrl: '/newsletter-brand/flyer.jpg',
      alt: 'Preview of our class',
      text: 'Watch the class',
    }),
  ],
});
const input = {
  subject: 'This week',
  previewText: '',
  document,
  schedule: [],
  origin: 'https://www.rhyzefitness.com',
  unsubscribeUrl: 'https://www.rhyzefitness.com/unsubscribe/example',
  postalAddress: 'Studio address',
};
it('renders a linked video thumbnail and plain text video link without embedded video', () => {
  const result = renderNewsletter(input);
  expect(result.html).toContain('href="https://vimeo.com/123"><img');
  expect(result.html).toContain('alt="Preview of our class"');
  expect(result.html).not.toMatch(/<video|<iframe/);
  expect(result.text).toContain('https://vimeo.com/123');
});
it('blocks unsafe video links and missing thumbnails before sending', () => {
  const doc = structuredClone(document);
  doc.blocks[0].url = 'javascript:alert(1)';
  doc.blocks[0].thumbnailUrl = '';
  const errors = validateContent({
    ...input,
    document: doc,
    type: 'CUSTOM',
    sender: 'Rhyze <test@example.test>',
    replyTo: 'test@example.test',
    googleReviewUrl: '',
  });
  expect(errors).toContain('Add a valid HTTPS video link.');
  expect(errors).toContain('Upload or choose a video thumbnail.');
  expect(renderNewsletter({ ...input, document: doc }).html).not.toContain(
    'javascript:',
  );
});

it('leaves existing non-video document shapes unchanged for prior campaign approvals', () => {
  const original = blockSchema.parse({
    id: 'existing',
    type: 'text',
    text: 'Welcome',
  });
  expect(original).not.toHaveProperty('thumbnailUrl');
});
