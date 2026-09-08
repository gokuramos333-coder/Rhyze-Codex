import { describe, expect, it } from 'vitest';
import {
  chargeAttendanceFeeWithGateway,
  refundAttendanceFeeWithGateway,
  type AttendanceFeeGateway,
  type AttendanceFeePaymentRequest,
  type AttendanceFeeRecord,
} from '@/lib/payments/attendance-fee';

function gateway(input?: {
  defaultPaymentMethodId?: string | null;
  attachedPaymentMethodIds?: string[];
  paymentError?: Error;
}) {
  const requests: AttendanceFeePaymentRequest[] = [];
  const records: AttendanceFeeRecord[] = [];
  const implementation: AttendanceFeeGateway = {
    retrieveCustomer: async () => ({
      deleted: false,
      defaultPaymentMethodId: input?.defaultPaymentMethodId ?? null,
    }),
    listAttachedCardPaymentMethodIds: async () => input?.attachedPaymentMethodIds ?? [],
    createPaymentIntent: async (request) => {
      requests.push(request);
      if (input?.paymentError) throw input.paymentError;
      return { id: 'pi_fee_123', status: 'succeeded' };
    },
    recordAttempt: async (record) => {
      records.push(record);
    },
  };
  return { implementation, requests, records };
}

describe('attendance fee charging', () => {
  const lateCancel = {
    bookingId: 'booking_123',
    userId: 'member_123',
    stripeCustomerId: 'cus_123',
    feeType: 'LATE_CANCELLATION' as const,
    amountCents: 1_000,
    idempotencyKey: 'late-cancel-fee-booking_123',
  };

  it('charges the default saved card with exact off-session terms and records revenue', async () => {
    const fake = gateway({ defaultPaymentMethodId: 'pm_default' });

    const result = await chargeAttendanceFeeWithGateway(lateCancel, fake.implementation);

    expect(result).toEqual({ status: 'SUCCEEDED', paymentIntentId: 'pi_fee_123' });
    expect(fake.requests).toEqual([{
      amount: 1_000,
      currency: 'usd',
      customer: 'cus_123',
      paymentMethod: 'pm_default',
      confirm: true,
      offSession: true,
      description: 'Rhyze late-cancellation fee',
      metadata: {
        bookingId: 'booking_123',
        memberId: 'member_123',
        feeType: 'LATE_CANCELLATION',
        amountCents: '1000',
      },
      idempotencyKey: 'late-cancel-fee-booking_123',
    }]);
    expect(fake.records).toEqual([{
      userId: 'member_123',
      bookingId: 'booking_123',
      kind: 'LATE_CANCELLATION_FEE',
      status: 'SUCCEEDED',
      amountCents: 1_000,
      stripeEventId: 'attendance-fee:pi_fee_123',
      stripeCustomerId: 'cus_123',
      stripePaymentIntentId: 'pi_fee_123',
    }]);
  });

  it('uses an attached card when the customer invoice default is empty', async () => {
    const fake = gateway({ attachedPaymentMethodIds: ['pm_attached'] });

    const result = await chargeAttendanceFeeWithGateway(lateCancel, fake.implementation);

    expect(result.status).toBe('SUCCEEDED');
    expect(fake.requests[0]?.paymentMethod).toBe('pm_attached');
  });

  it('records a failed attempt without charging when no saved card exists', async () => {
    const fake = gateway();

    const result = await chargeAttendanceFeeWithGateway(lateCancel, fake.implementation);

    expect(result).toEqual({ status: 'FAILED', paymentIntentId: null, reason: 'NO_SAVED_PAYMENT_METHOD' });
    expect(fake.requests).toEqual([]);
    expect(fake.records).toEqual([{
      userId: 'member_123',
      bookingId: 'booking_123',
      kind: 'LATE_CANCELLATION_FEE',
      status: 'FAILED',
      amountCents: 1_000,
      stripeEventId: 'attendance-fee-failed:LATE_CANCELLATION:late-cancel-fee-booking_123',
      stripeCustomerId: 'cus_123',
      stripePaymentIntentId: null,
    }]);
  });

  it('records a declined off-session fee as failed', async () => {
    const fake = gateway({
      defaultPaymentMethodId: 'pm_declined',
      paymentError: new Error('card declined'),
    });

    const result = await chargeAttendanceFeeWithGateway(lateCancel, fake.implementation);

    expect(result).toEqual({ status: 'FAILED', paymentIntentId: null, reason: 'PAYMENT_FAILED' });
    expect(fake.records[0]).toMatchObject({
      kind: 'LATE_CANCELLATION_FEE',
      status: 'FAILED',
      stripeEventId: 'attendance-fee-failed:LATE_CANCELLATION:late-cancel-fee-booking_123',
    });
  });

  it('maps no-show and transfer attempts to distinct ledger kinds', async () => {
    const noShow = gateway({ defaultPaymentMethodId: 'pm_default' });
    const transfer = gateway({ defaultPaymentMethodId: 'pm_default' });

    await chargeAttendanceFeeWithGateway({ ...lateCancel, feeType: 'NO_SHOW' }, noShow.implementation);
    await chargeAttendanceFeeWithGateway({ ...lateCancel, feeType: 'TRANSFER' }, transfer.implementation);

    expect(noShow.records[0]?.kind).toBe('NO_SHOW_FEE');
    expect(transfer.records[0]?.kind).toBe('TRANSFER_FEE');
  });

  it('refunds a fee when the booking mutation cannot be completed', async () => {
    const refunded: Array<{ paymentIntentId: string; idempotencyKey: string }> = [];
    const marked: Array<{ paymentIntentId: string; amountCents: number }> = [];

    await refundAttendanceFeeWithGateway(
      {
        paymentIntentId: 'pi_fee_123',
        amountCents: 500,
        idempotencyKey: 'refund-transfer-booking_123',
      },
      {
        refundPaymentIntent: async (request) => {
          refunded.push(request);
        },
        markPaymentRefunded: async (record) => {
          marked.push(record);
        },
      },
    );

    expect(refunded).toEqual([{
      paymentIntentId: 'pi_fee_123',
      idempotencyKey: 'refund-transfer-booking_123',
    }]);
    expect(marked).toEqual([{ paymentIntentId: 'pi_fee_123', amountCents: 500 }]);
  });
});
