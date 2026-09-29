import { describe, expect, it, vi } from 'vitest';
import { refundCommerceOrderFullRemainder } from '@/lib/payments/commerce-refunds';
import { queueEmail } from '@/lib/notifications/email-queue';

vi.mock('@/lib/notifications/email-queue', () => ({
  queueEmail: vi.fn(),
}));

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_event_refund',
    userId: 'member_event_refund',
    occurrenceId: 'occ_event_refund',
    kind: 'EVENT',
    status: 'PAID',
    amountCents: 3000,
    refundedAmountCents: 0,
    currency: 'usd',
    stripePaymentIntentId: 'pi_event_refund',
    customerEmail: 'member@example.test',
    user: {
      id: 'member_event_refund',
      email: 'member@example.test',
      name: 'Member',
    },
    items: [{ name: 'Synthetic event', quantity: 1 }],
    occurrence: {
      id: 'occ_event_refund',
      startAt: new Date('2026-09-26T16:00:00Z'),
      template: { name: 'Synthetic event' },
    },
    paymentRecords: [
      {
        id: 'payment_event_refund',
        commerceOrderId: 'order_event_refund',
        stripePaymentIntentId: 'pi_event_refund',
        userId: 'member_event_refund',
        kind: 'EVENT',
        status: 'SUCCEEDED',
        amountCents: 3000,
        currency: 'usd',
      },
    ],
    ...overrides,
  };
}

function stripe(refundStatus = 'succeeded', chargeRefunds: any[] = []) {
  return {
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'pi_event_refund',
        status: 'succeeded',
        amount: 3000,
        currency: 'usd',
        latest_charge: 'ch_event_refund',
        metadata: { commerceOrderId: 'order_event_refund' },
      }),
    },
    charges: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'ch_event_refund',
        status: 'succeeded',
        paid: true,
        amount: 3000,
        amount_refunded: chargeRefunds
          .filter((refund) => refund.status === 'succeeded')
          .reduce((sum, refund) => sum + refund.amount, 0),
        currency: 'usd',
        payment_intent: 'pi_event_refund',
        metadata: {},
        refunds: { data: chargeRefunds },
      }),
    },
    refunds: {
      list: vi.fn().mockResolvedValue({ data: chargeRefunds, has_more: false }),
      create: vi.fn().mockResolvedValue({
        id: 're_event_refund',
        amount: 3000,
        status: refundStatus,
        charge: 'ch_event_refund',
        payment_intent: 'pi_event_refund',
        currency: 'usd',
      }),
      retrieve: vi.fn().mockResolvedValue({
        id: 're_event_refund',
        amount: 3000,
        status: refundStatus,
        charge: 'ch_event_refund',
        payment_intent: 'pi_event_refund',
        currency: 'usd',
      }),
    },
  };
}

function db(fixture = order()) {
  let refundOperation: any = null;
  const tx: any = {
    $executeRaw: vi.fn(),
    commerceOrder: {
      findFirst: vi.fn().mockResolvedValue(fixture),
      findMany: vi.fn().mockResolvedValue([fixture]),
      update: vi.fn(),
    },
    commerceRefund: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.operationKey) return refundOperation;
        if (
          where.stripeRefundId &&
          refundOperation?.stripeRefundId === where.stripeRefundId
        ) {
          return refundOperation;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: any) => {
        refundOperation = {
          id: 'pending_refund_row',
          createdAt: new Date(0),
          ...data,
        };
        return refundOperation;
      }),
      update: vi.fn(async ({ data }: any) => {
        refundOperation = { ...refundOperation, ...data };
        return refundOperation;
      }),
      upsert: vi.fn(),
    },
    paymentRecord: { updateMany: vi.fn() },
    booking: {
      findFirst: vi.fn().mockResolvedValue({ id: 'booking_event_refund' }),
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 'booking_event_refund', source: 'STRIPE_EVENT' },
        ]),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    bookingTransfer: { findFirst: vi.fn().mockResolvedValue(null) },
    creditLedgerEntry: { findFirst: vi.fn().mockResolvedValue(null) },
    attendanceRecord: { deleteMany: vi.fn() },
    emailMessage: { updateMany: vi.fn() },
    auditLog: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
  };
  const client: any = {
    $transaction: vi.fn(async (callback: (tx: any) => unknown) => callback(tx)),
    commerceRefund: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
  return { client, tx };
}

const input = {
  orderId: 'order_event_refund',
  actorId: 'owner_event_refund',
  reason: 'Studio postponed event',
  confirmation: 'REFUND',
  memberUserId: 'member_event_refund',
};

describe('safe commerce refunds', () => {
  it('stores the provider refund date when an older succeeded refund is reconciled', async () => {
    const f = db();
    const providerRefund = { id: 're_historical', amount: 3000, status: 'succeeded', created: 1786795200, charge: 'ch_event_refund', payment_intent: 'pi_event_refund', currency: 'usd' };
    const s = stripe('succeeded', [providerRefund]);
    await refundCommerceOrderFullRemainder(f.client, s as never, input);
    expect(f.tx.commerceRefund.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stripeRefundId: 're_historical', createdAt: new Date('2026-08-15T12:00:00Z') }) }));
  });
  it('does not mark the order refunded, cleanup bookings, or email success when provider readback is pending', async () => {
    const f = db();
    const s = stripe('pending');

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).rejects.toMatchObject({ code: 'provider_pending' });

    expect(s.refunds.retrieve).toHaveBeenCalledWith('re_event_refund');
    expect(f.tx.commerceRefund.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
    expect(f.tx.commerceOrder.update).not.toHaveBeenCalled();
    expect(f.tx.paymentRecord.updateMany).not.toHaveBeenCalled();
    expect(f.tx.booking.updateMany).not.toHaveBeenCalled();
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('reconciles a succeeded full event refund with exact booking, attendance, reminder and email changes', async () => {
    const f = db();
    const s = stripe('succeeded');

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      amountCents: 3000,
      stripeRefundId: 're_event_refund',
    });

    expect(s.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ charge: 'ch_event_refund', amount: 3000 }),
      { idempotencyKey: 'commerce-refund-full:order_event_refund' },
    );
    expect(f.tx.commerceOrder.update).toHaveBeenCalledWith({
      where: { id: 'order_event_refund' },
      data: { status: 'REFUNDED', refundedAmountCents: 3000 },
    });
    expect(f.tx.paymentRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'REFUNDED', refundedAmountCents: 3000 },
      }),
    );
    expect(f.tx.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'booking_event_refund', status: { not: 'CANCELLED' } },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    expect(f.tx.attendanceRecord.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { bookingId: 'booking_event_refund' },
          {
            bookingId: null,
            occurrenceId: 'occ_event_refund',
            userId: 'member_event_refund',
          },
        ],
      },
    });
    expect(f.tx.emailMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dedupeKey: 'class-reminder:booking_event_refund:occ_event_refund',
        }),
        data: { status: 'CANCELLED' },
      }),
    );
    expect(f.tx.creditLedgerEntry.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { bookingId: 'booking_event_refund' },
          { sourceReturnKey: 'event-cancellation:booking_event_refund' },
        ],
      },
    });
    expect(queueEmail).toHaveBeenCalledWith(
      f.tx,
      expect.objectContaining({
        template: 'PAYMENT_REFUND_CONFIRMATION',
        dedupeKey: 'refund-confirmation:commerce:order_event_refund:3000',
      }),
    );
  });

  it('fails closed for provider charge identity mismatches before creating a refund', async () => {
    const f = db();
    const s = stripe('succeeded');
    s.paymentIntents.retrieve.mockResolvedValueOnce({
      id: 'pi_event_refund',
      status: 'succeeded',
      amount: 3000,
      currency: 'usd',
      latest_charge: 'ch_event_refund',
      metadata: { commerceOrderId: 'different_order' },
    });

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).rejects.toMatchObject({ code: 'provider_mismatch' });

    expect(s.refunds.create).not.toHaveBeenCalled();
    expect(f.tx.commerceOrder.update).not.toHaveBeenCalled();
  });

  it('fails closed when an external provider refund is still pending', async () => {
    const pending = {
      id: 're_external_pending',
      amount: 1000,
      status: 'pending',
      charge: 'ch_event_refund',
      payment_intent: 'pi_event_refund',
      currency: 'usd',
    };
    const f = db();
    const s = stripe('succeeded', [pending]);

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).rejects.toMatchObject({ code: 'provider_pending' });

    expect(s.refunds.create).not.toHaveBeenCalled();
    expect(f.tx.commerceOrder.update).not.toHaveBeenCalled();
  });

  it('paginates provider refunds before deciding whether another cash refund is safe', async () => {
    const f = db();
    const s = stripe('succeeded');
    s.refunds.list
      .mockResolvedValueOnce({
        data: [
          {
            id: 're_page_1',
            amount: 100,
            status: 'succeeded',
            charge: 'ch_event_refund',
            payment_intent: 'pi_event_refund',
            currency: 'usd',
          },
        ],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 're_page_2_pending',
            amount: 2900,
            status: 'pending',
            charge: 'ch_event_refund',
            payment_intent: 'pi_event_refund',
            currency: 'usd',
          },
        ],
        has_more: false,
      });

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).rejects.toMatchObject({ code: 'provider_pending' });

    expect(s.refunds.list).toHaveBeenNthCalledWith(2, {
      charge: 'ch_event_refund',
      limit: 100,
      starting_after: 're_page_1',
    });
    expect(s.refunds.create).not.toHaveBeenCalled();
    expect(f.tx.commerceOrder.update).not.toHaveBeenCalled();
  });

  it('fails closed when provider readback returns a refund for another charge', async () => {
    const f = db();
    const s = stripe('succeeded');
    s.refunds.retrieve.mockResolvedValueOnce({
      id: 're_event_refund',
      amount: 3000,
      status: 'succeeded',
      charge: 'ch_other',
      payment_intent: 'pi_event_refund',
      currency: 'usd',
    });

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).rejects.toMatchObject({ code: 'provider_mismatch' });

    expect(f.tx.commerceOrder.update).not.toHaveBeenCalled();
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('fails closed when the event booking provenance is ambiguous', async () => {
    const f = db();
    const s = stripe('succeeded');
    f.tx.booking.findMany.mockResolvedValueOnce([
      { id: 'booking_event_refund', source: 'STRIPE_EVENT' },
      { id: 'booking_second_same_member_occurrence', source: 'STRIPE_EVENT' },
    ]);

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).rejects.toMatchObject({ code: 'not_refundable' });

    expect(f.tx.commerceOrder.update).not.toHaveBeenCalled();
    expect(f.tx.booking.updateMany).not.toHaveBeenCalled();
    expect(s.refunds.create).not.toHaveBeenCalled();
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('fails closed before provider mutation when multiple event orders share the same member occurrence', async () => {
    const f = db();
    const s = stripe('succeeded');
    f.tx.commerceOrder.findMany.mockResolvedValueOnce([
      { id: 'order_event_refund' },
      { id: 'order_second_same_member_occurrence' },
    ]);

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).rejects.toMatchObject({ code: 'not_refundable' });

    expect(s.refunds.create).not.toHaveBeenCalled();
    expect(f.tx.commerceOrder.update).not.toHaveBeenCalled();
    expect(f.tx.booking.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed when a returned credit already exists for the event booking', async () => {
    const f = db();
    const s = stripe('succeeded');
    f.tx.creditLedgerEntry.findFirst.mockResolvedValueOnce({
      id: 'returned_credit',
      type: 'RESTORE',
      bookingId: 'booking_event_refund',
    });

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).rejects.toMatchObject({ code: 'not_refundable' });

    expect(f.tx.commerceOrder.update).not.toHaveBeenCalled();
    expect(f.tx.booking.updateMany).not.toHaveBeenCalled();
    expect(s.refunds.create).not.toHaveBeenCalled();
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('fails closed when any booking ledger history exists for the event booking', async () => {
    const f = db();
    const s = stripe('succeeded');
    f.tx.creditLedgerEntry.findFirst.mockResolvedValueOnce({
      id: 'reserve_credit',
      type: 'RESERVE',
      bookingId: 'booking_event_refund',
    });

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).rejects.toMatchObject({ code: 'not_refundable' });

    expect(s.refunds.create).not.toHaveBeenCalled();
    expect(f.tx.commerceOrder.update).not.toHaveBeenCalled();
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('fails closed before provider mutation when an event cancellation GRANT exists for the booking', async () => {
    const f = db();
    const s = stripe('succeeded');
    f.tx.creditLedgerEntry.findFirst.mockResolvedValueOnce({
      id: 'returned_event_credit',
      type: 'GRANT',
      bookingId: 'booking_event_refund',
      sourceReturnKey: 'event-cancellation:booking_event_refund',
    });

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).rejects.toMatchObject({ code: 'not_refundable' });

    expect(s.refunds.create).not.toHaveBeenCalled();
    expect(f.tx.commerceOrder.update).not.toHaveBeenCalled();
    expect(f.tx.booking.updateMany).not.toHaveBeenCalled();
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('allows fulfillment review event orders with no booking to receive cash reconciliation only', async () => {
    const f = db(order({ status: 'FULFILLMENT_REVIEW' }));
    const s = stripe('succeeded');
    f.tx.booking.findMany.mockResolvedValueOnce([]);

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      amountCents: 3000,
      stripeRefundId: 're_event_refund',
    });

    expect(s.refunds.create).toHaveBeenCalledOnce();
    expect(f.tx.booking.updateMany).not.toHaveBeenCalled();
    expect(f.tx.attendanceRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('recovers a pending operation row from provider metadata after a DB failure', async () => {
    const providerRefund = {
      id: 're_db_failed_after_provider_success',
      amount: 3000,
      status: 'succeeded',
      charge: 'ch_event_refund',
      payment_intent: 'pi_event_refund',
      currency: 'usd',
      metadata: { operationKey: 'commerce-refund-full:order_event_refund' },
    };
    const f = db();
    const s = stripe('succeeded', [providerRefund]);
    f.client.commerceRefund.findUnique.mockResolvedValueOnce({
      id: 'pending_refund_row',
      status: 'PENDING',
      stripeRefundId: null,
      operationKey: 'commerce-refund-full:order_event_refund',
    });

    await expect(
      refundCommerceOrderFullRemainder(f.client, s as never, input),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      stripeRefundId: 're_db_failed_after_provider_success',
    });

    expect(s.refunds.create).not.toHaveBeenCalled();
    expect(f.tx.commerceRefund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pending_refund_row' },
        data: expect.objectContaining({
          stripeRefundId: 're_db_failed_after_provider_success',
          status: 'SUCCEEDED',
        }),
      }),
    );
  });
});
