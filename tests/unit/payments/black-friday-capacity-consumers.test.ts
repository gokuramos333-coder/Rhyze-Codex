import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('excludes held tickets from zero-attendance jobs and keeps their seats unavailable in the newsletter', () => {
  expect(readFileSync('lib/domain/schedule/low-attendance-cancellations.ts', 'utf8').match(/pendingTicketSeats: 0/g)).toHaveLength(2);
  expect(readFileSync('lib/newsletters/repository.ts', 'utf8')).toContain('x.pendingTicketSeats');
});

it.each([
  'app/schedule/[occurrenceId]/page.tsx',
  'app/(portal)/member/bookings/actions.ts',
  'app/(portal)/member/bookings/new/page.tsx',
  'app/(portal)/member/bookings/reschedule/actions.ts',
  'app/(portal)/member/bookings/reschedule/page.tsx',
  'app/(portal)/instructor/classes/[occurrenceId]/transfers/actions.ts',
  'app/(portal)/instructor/classes/[occurrenceId]/transfers/page.tsx',
  'app/book/event/[slug]/page.tsx',
  'app/book/[slug]/page.tsx',
  'app/api/checkout/event/route.ts',
  'app/(studio)/admin/schedule/[occurrenceId]/roster/actions.ts',
  'app/events/[slug]/page.tsx',
  'lib/payments/class-ticket-checkout.ts',
  'lib/payments/class-ticket-fulfillment.ts',
  'lib/payments/webhook-processor.ts',
  'lib/admin/stripe-event-payment-linking.ts',
  'lib/domain/schedule/public-schedule-query.ts',
  'lib/domain/bookings/waitlist.ts',
  'components/sections/EventsPreview.tsx',
])('keeps pending seats in capacity calculations in %s', (path) => {
  expect(readFileSync(path, 'utf8')).toContain('pendingTicketSeats');
});
