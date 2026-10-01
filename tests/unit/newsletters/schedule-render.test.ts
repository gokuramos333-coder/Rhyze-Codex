import { describe, expect, it } from 'vitest';
import { documentSchema, type ScheduleItem } from '@/lib/newsletters/domain';
import { renderNewsletter } from '@/lib/newsletters/render';

const session = (
  id: string,
  startAt: string,
  changes: Partial<ScheduleItem> = {},
): ScheduleItem => ({
  id,
  title: id,
  startAt,
  endAt: new Date(new Date(startAt).getTime() + 50 * 60000).toISOString(),
  instructor: 'Instructor Example',
  instructorPhoto: '/founders/instructor-vanessa.jpg',
  category: 'Dance',
  description: 'A welcoming dance class.',
  image: '/class-art.jpg',
  isEvent: false,
  status: 'SCHEDULED',
  available: 5,
  href: '/book/' + id,
  ...changes,
});
const render = (schedule: ScheduleItem[], featured?: string) =>
  renderNewsletter({
    subject: 'This week',
    previewText: '',
    origin: 'https://example.test',
    unsubscribeUrl: '/unsubscribe/example',
    postalAddress: 'Studio address',
    schedule,
    document: documentSchema.parse({
      version: 1,
      blocks: [
        {
          id: 'schedule',
          type: featured ? 'class' : 'schedule',
          occurrenceId: featured,
        },
      ],
    }),
  });
describe('Newsletter weekly agenda and featured instructor', () => {
  it('groups classes and events by Eastern day in time order, omitting empty/cancelled-only days', () => {
    const { html } = render([
      session('Friday Event', '2026-10-09T23:00:00Z', { isEvent: true }),
      session('Evening Class', '2026-10-05T22:00:00Z'),
      session('Cancelled Tuesday', '2026-10-06T15:00:00Z', {
        status: 'CANCELLED',
      }),
      session('Morning Class', '2026-10-05T13:00:00Z'),
      session('Monday Event', '2026-10-05T23:00:00Z', { isEvent: true }),
    ]);
    expect(html).toContain('Monday</h2>');
    expect(html).toContain('Friday</h2>');
    expect(html).toContain('2 classes · 1 event');
    for (const day of [
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Saturday',
      'Sunday',
    ])
      expect(html).not.toContain(day + '</h2>');
    expect(html).not.toContain('Cancelled Tuesday');
    expect(html.indexOf('Morning Class</h3>')).toBeLessThan(
      html.indexOf('Evening Class</h3>'),
    );
    expect(html.indexOf('Monday Event</h3>')).toBeLessThan(
      html.indexOf('Friday</h2>'),
    );
    expect(html).toContain('>EVENT</span>');
  });
  it('uses the Eastern calendar date when UTC has rolled to the next day', () => {
    const { html } = render([session('Late class', '2026-10-06T00:30:00Z')]);
    expect(html).toContain('Monday</h2>');
    expect(html).toContain('Oct 5');
    expect(html).toContain('8:30 PM');
    expect(html).not.toContain('Tuesday');
  });
  it('shows the selected instructor portrait, not class artwork, in a feature', () => {
    const { html } = render(
      [session('Featured', '2026-10-05T13:00:00Z')],
      'Featured',
    );
    expect(html).toContain(
      'src="https://example.test/founders/instructor-vanessa.jpg"',
    );
    expect(html).toContain('alt="Instructor Example"');
    expect(html).toContain('width="88"');
    expect(html).toContain('A welcoming dance class.');
    expect(html).toContain('50 min');
    expect(html).not.toContain('/class-art.jpg');
  });
  it('falls back safely for absent or unsafe portraits, including older snapshots', () => {
    for (const instructorPhoto of [
      undefined,
      '',
      '/brand/rhyze-logo-header.png',
      'javascript:alert(1)',
      '//evil.test/photo',
    ]) {
      const { html } = render(
        [session('Featured', '2026-10-05T13:00:00Z', { instructorPhoto })],
        'Featured',
      );
      expect(html).toContain('alt="Rhyze Fitness"');
      expect(html).not.toContain('javascript:');
      expect(html).not.toContain('evil.test');
      expect(html).toContain('Instructor Example');
    }
  });
  it('keeps compact booking controls accessible and blocks unavailable sessions', () => {
    const start = new Date(Date.now() + 86400000).toISOString();
    const { html } = render([
      session('Open class', start),
      session('Full class', start, { available: 0 }),
      session('Past class', '2020-01-01T12:00:00Z'),
    ]);
    expect(html).toContain('aria-label="Book Open class"');
    expect(html).toContain('>BOOK</a>');
    expect(html).not.toContain('aria-label="Book Full class"');
    expect(html).not.toContain('aria-label="Book Past class"');
    expect(html).toContain('>Full</span>');
    expect(html).toContain('>Ended</span>');
  });
  it('does not create weekday headings for an empty schedule', () => {
    expect(render([]).html).not.toMatch(
      /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)<\/h2>/,
    );
  });
});
