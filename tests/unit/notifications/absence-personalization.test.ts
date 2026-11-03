import { describe, expect, it } from 'vitest';
import { absenceDocument } from '@/lib/domain/engagement/member-absence';
import { renderNewsletter } from '@/lib/newsletters/render';
describe('approved absence greeting', () => {
  it.each(['Kelly', 'Kim-Marie', 'María', 'A&B'])(
    'personalizes subject, HTML and plain text for %s',
    (firstName) => {
      const result = renderNewsletter({
        subject: 'We miss you, {{first_name}} 💛',
        previewText: 'Let’s make time for your next class.',
        document: absenceDocument,
        schedule: [],
        firstName,
        origin: 'https://www.rhyzefitness.com',
        unsubscribeUrl:
          'https://www.rhyzefitness.com/newsletter/unsubscribe/test',
        postalAddress: 'Synthetic studio',
      });
      expect(result.subject).toBe(`We miss you, ${firstName} 💛`);
      expect(result.text).toContain(`We miss you, ${firstName} 💛`);
      expect(result.html).toContain(
        `We miss you, ${firstName.replaceAll('&', '&amp;')} 💛`,
      );
      expect(result.html).not.toContain('Rhyze Tribe');
      expect(result.html).not.toContain('{{first_name}}');
      expect(result.html).toContain('Unsubscribe from marketing emails');
      expect(result.html).toContain('Find my next class');
    },
  );
  it('escapes a name rather than injecting it as HTML', () => {
    const result = renderNewsletter({
      subject: 'We miss you, {{first_name}} 💛',
      previewText: '',
      document: absenceDocument,
      schedule: [],
      firstName: '<img src=x onerror=alert(1)>',
      origin: 'https://www.rhyzefitness.com',
      unsubscribeUrl:
        'https://www.rhyzefitness.com/newsletter/unsubscribe/test',
      postalAddress: 'Synthetic studio',
    });
    expect(result.html).not.toContain('<img src=x');
    expect(result.html).toContain('&lt;img');
  });
});
