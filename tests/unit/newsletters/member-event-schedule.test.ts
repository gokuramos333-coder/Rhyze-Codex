import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ classOccurrence: { findMany: vi.fn() } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: db }));
import { loadSchedule } from '@/lib/newsletters/repository';
import { renderNewsletter } from '@/lib/newsletters/render';
import { documentSchema } from '@/lib/newsletters/domain';

const occurrence = {
  id: 'rachel-oct16', startAt: new Date('2026-10-16T23:30Z'), endAt: new Date('2026-10-17T00:30Z'),
  instructor: { name: 'Rachel Crowe' }, capacity: 25, historicalSignupCount: 0, bookings: [], status: 'SCHEDULED',
  template: { slug: 'soul-line-dancing-rachel', name: 'Soul Line Dancing with Rachel', isEvent: false, description: 'Connection and joy', category: { name: 'Dance' } },
};
beforeEach(() => db.classOccurrence.findMany.mockResolvedValue([occurrence]));
describe('Member-credit event newsletter presentation', () => {
  it('shows Rachel as an event and preserves the occurrence in the public event link', async () => {
    const schedule = await loadSchedule('2026-10-12');
    expect(schedule[0]).toMatchObject({ isEvent: true, href: '/events/soul-line-dancing-rachel?occurrence=rachel-oct16' });
    const { html } = renderNewsletter({ subject: 'This week', previewText: '', origin: 'https://example.test', unsubscribeUrl: '/unsubscribe/example', postalAddress: 'Studio address', schedule, document: documentSchema.parse({ version: 1, blocks: [{ id: 'schedule', type: 'schedule' }] }) });
    expect(html).toContain('>EVENT</span>');
    expect(html).toContain('1 event');
    expect(html).not.toContain('1 class');
    expect(occurrence.template.isEvent).toBe(false);
  });
  it('keeps standard classes and ordinary events classified correctly', async () => {
    db.classOccurrence.findMany.mockResolvedValue([
      { ...occurrence, id: 'standard', template: { ...occurrence.template, slug: 'rhyze-ritmo-melissa' } },
      { ...occurrence, id: 'event', template: { ...occurrence.template, slug: 'mommy-and-me-dennisse', isEvent: true } },
    ]);
    expect((await loadSchedule('2026-10-12')).map(s => ({ isEvent: s.isEvent, href: s.href }))).toEqual([
      { isEvent: false, href: '/book/rhyze-ritmo-melissa?occurrence=standard' },
      { isEvent: true, href: '/events/mommy-and-me-dennisse?occurrence=event' },
    ]);
  });
});
