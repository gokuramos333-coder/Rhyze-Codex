import { expect, it } from 'vitest';
import { renderTransactionalEmail } from '@/lib/notifications/email-content';

it('does not promise exclusive priority through an old edited waitlist template', () => {
 const result = renderTransactionalEmail({ subject: 'A spot opened for Dance', template: 'WAITLIST_SPOT_AVAILABLE', payload: { name: 'Test', className: 'Dance', classDate: 'Friday', classTime: '7 PM', claimUrl: '/book/event/dance?occurrence=date-two' }, copyOverride: { subject: 'Your place is reserved', eyebrow: 'You’re first in line', headline: 'A spot is ready for you', paragraphs: ["Since you are at the top of the waitlist, you have first access."], greeting: 'Hello {{name}},', closing: 'See you soon!' } });
 expect(result.text).toContain('Everyone on the waiting list is notified');
 expect(result.text).toContain('not automatically booked or charged');
 expect(result.text).not.toContain('first access');
 expect(result.text).not.toContain('first in line');
 expect(result.subject).not.toContain('reserved');
 expect(result.text).toContain('Hello Test,');
 expect(result.html).toContain('occurrence=date-two');
});
