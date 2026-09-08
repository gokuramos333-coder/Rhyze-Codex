import { describe, expect, it } from 'vitest';
import {
  chargeIdFromSyncedPaymentRecord,
  excludeSombleBackedStripePaymentRecords,
  isSombleBackedStripePaymentRecord,
  somblePaymentIdSet,
} from '@/lib/admin/payment-record-dedupe';

describe('payment record Somble dedupe', () => {
  it('recognizes Stripe charge records already represented by Somble payment ids', () => {
    const sombleIds = somblePaymentIdSet([{ paymentId: 'ch_somble_30' }]);

    expect(chargeIdFromSyncedPaymentRecord({ stripeEventId: 'stripe-sync-charge-ch_somble_30' })).toBe('ch_somble_30');
    expect(
      isSombleBackedStripePaymentRecord(
        { stripeEventId: 'stripe-sync-charge-ch_somble_30', stripePaymentIntentId: 'pi_live' },
        sombleIds,
      ),
    ).toBe(true);
    expect(
      isSombleBackedStripePaymentRecord(
        { stripeEventId: 'stripe-sync-charge-ch_new_rhyze', stripePaymentIntentId: 'pi_new' },
        sombleIds,
      ),
    ).toBe(false);
  });

  it('keeps only direct/native Stripe records that are not duplicated by Somble transfers', () => {
    const filtered = excludeSombleBackedStripePaymentRecords(
      [
        { id: 'duplicated', stripeEventId: 'stripe-sync-charge-ch_somble_30', stripePaymentIntentId: 'pi_a' },
        { id: 'native', stripeEventId: 'stripe-sync-charge-ch_native_25', stripePaymentIntentId: 'pi_b' },
      ],
      [{ paymentId: 'ch_somble_30' }],
    );

    expect(filtered.map((record) => record.id)).toEqual(['native']);
  });
});
