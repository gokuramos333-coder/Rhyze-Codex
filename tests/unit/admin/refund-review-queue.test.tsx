// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  RefundReviewQueue,
  type RefundReviewItem,
} from '@/components/admin/refund-review-queue';
afterEach(cleanup);
const item: RefundReviewItem = {
  id: 'synthetic-review',
  paymentRecordId: 'synthetic-payment',
  identity: {
    customerName: 'Alex Example',
    customerEmail: 'alex@example.test',
    customerId: 'synthetic-member',
    bookingId: 'synthetic-booking',
    className: 'Synthetic Pilates',
    classStart: '2026-11-20T15:00:00Z',
    paymentIntentId: 'synthetic-intent',
    originalAmountCents: 1000,
    refundedAmountCents: 0,
    receiptUrl: 'https://example.test/receipt',
  },
  version: 1,
  reason: 'Correct attendance without moving money',
  amountCents: 1000,
  state: 'URGENT',
  kind: 'REFUND',
  createdAt: 'today',
};
describe('owner review component', () => {
  it('requires a case reason, preserves exact amount and shows the adapter result', async () => {
    const act = vi.fn(async () => 'UNKNOWN: reconcile existing operation');
    render(<RefundReviewQueue items={[item]} act={act} simulation />);
    expect(screen.getByText('SIMULATION — synthetic data only.')).toBeTruthy();
    const button = screen.getByRole('button');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Approved synthetic case' },
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(
        screen.getByText('UNKNOWN: reconcile existing operation'),
      ).toBeTruthy(),
    );
    expect(act).toHaveBeenCalledWith({
      ...item,
      reason: 'Approved synthetic case',
    });
  });
  it('reconciles pending receipts without another approval', async () => {
    const act = vi.fn(async () => 'PENDING: obligation remains open');
    render(
      <RefundReviewQueue
        items={[{ ...item, operationId: 'synthetic-operation' }]}
        act={act}
      />,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reconcile existing receipt' }),
    );
    await waitFor(() => expect(act).toHaveBeenCalledTimes(1));
  });
  it('shows errors and retains approval text', async () => {
    render(
      <RefundReviewQueue
        items={[item]}
        act={async () => {
          throw Error('Original card no longer attached');
        }}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Approved synthetic case' },
    });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByText('Original card no longer attached')).toBeTruthy(),
    );
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(
      'Approved synthetic case',
    );
  });
});

it('shows the exact customer, booking and payment beside approval', () => {
  render(<RefundReviewQueue items={[item]} act={vi.fn()} />);
  for (const value of [
    'Alex Example',
    'alex@example.test',
    'synthetic-member',
    'synthetic-booking',
    'Synthetic Pilates',
    'synthetic-intent',
    'synthetic-payment',
  ]) {
    expect(screen.getByText(value, { exact: false })).toBeTruthy();
  }
  expect(
    screen.getByRole('link', { name: 'Original receipt' }).getAttribute('href'),
  ).toBe('https://example.test/receipt');
  expect(
    screen.getByText(/Original.*10.00.*Refunded.*0.00.*Remaining.*10.00/),
  ).toBeTruthy();
});
