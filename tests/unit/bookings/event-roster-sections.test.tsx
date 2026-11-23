import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { BlackFridayPendingRoster } from '@/components/attendance/BlackFridayPendingRoster';
import { EventPaymentReview } from '@/components/attendance/EventPaymentReview';
import type { SpecialEventRoster } from '@/lib/payments/special-event-roster';

const roster: SpecialEventRoster = {
  groups: [{
    orderId: 'paid',
    cashPaidCents: 1500,
    attendees: [{
      role: 'BUYER', fullName: 'Sample Buyer', phone: null, userId: 'buyer',
      bookingId: 'buyer-booking', contribution: 'VIP_EVENT_CREDIT', waiver: 'ELECTRONIC',
      attendanceStatus: 'CHECKED_IN', checkedInAt: new Date(), markedById: 'staff',
    }, {
      role: 'GUEST', fullName: 'Sample Guest', phone: '+12015550190', userId: null,
      bookingId: null, contribution: 'CASH_TICKET', waiver: 'NEEDED',
      attendanceStatus: null, checkedInAt: null, markedById: null,
    }],
  }],
  linkedBookingIds: ['buyer-booking'],
  reviewItems: [{
    orderId: 'held', management: 'SPECIAL_TICKET', buyerName: 'Sample Checkout', state: 'HELD',
    collectedCents: 0, remainingCents: 4000, canReconcile: true, canRefund: true,
  }, {
    orderId: 'expired', management: 'SPECIAL_TICKET', buyerName: 'Expired Checkout', state: 'EXPIRED',
    collectedCents: 0, remainingCents: 0, canReconcile: false, canRefund: false,
  }, {
    orderId: 'legacy', management: 'LEGACY_ORDER', buyerName: 'Legacy Buyer', state: 'FULFILLMENT_REVIEW',
    collectedCents: 3000, remainingCents: 3000, canReconcile: false, canRefund: false,
  }],
  currentWaiverVersionId: 'waiver', canLinkAccounts: true,
};

it('renders the paid buyer and named guest as individual attendance rows', () => {
  const html = renderToStaticMarkup(
    <BlackFridayPendingRoster roster={roster} renderNativeAttendance={() => <button>Undo check in</button>}
      actions={{ recordPaperWaiverAction: vi.fn(), checkInAction: vi.fn(), searchAccountsAction: vi.fn(), linkAccountAction: vi.fn() }} />,
  );
  expect(html.match(/Sample Buyer/g)).toHaveLength(1);
  expect(html.match(/Sample Guest/g)).toHaveLength(1);
  expect(html).toContain('Buyer · Account holder');
  expect(html).toContain('VIP event credit');
  expect(html).toContain('Guest · No account');
  expect(html).toContain('+12015550190');
  expect(html).toContain('Waiver needed');
  expect(html).toContain('Checked in');
  expect(html).toContain('Undo check in');
  expect(html).not.toContain('Sample Checkout');
  expect(html).not.toContain('Expired Checkout');
});

it('collapses payment review and requires a collected payment to show a refund action', () => {
  const html = renderToStaticMarkup(<EventPaymentReview items={roster.reviewItems} reviewAction={vi.fn()} />);
  expect(html).toMatch(/^<details class=/);
  expect(html).not.toMatch(/<details[^>]* open/);
  expect(html).toContain('Payments and checkout history');
  expect(html).toContain('Sample Checkout');
  expect(html).toContain('No payment collected');
  expect(html).toContain('Check payment status');
  expect(html).toContain('href="/admin/payments"');
  expect(html).not.toContain('Expired Checkout');
  expect(html).not.toContain('Refund and cancel ticket');
  expect(html).not.toContain('Remaining cash');

  const paid = { ...roster.reviewItems[0], state: 'PAID', collectedCents: 4000, remainingCents: 1500 };
  const paidHtml = renderToStaticMarkup(<EventPaymentReview items={[paid]} reviewAction={vi.fn()} />);
  expect(paidHtml).toContain('Approve $15.00 refund');
  expect(paidHtml).toContain('$40.00 collected');
});
