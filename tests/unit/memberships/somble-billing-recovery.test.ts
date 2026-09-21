import { describe, expect, it } from 'vitest';
import {
  recoveryForUser,
  eligibleRecovery,
  recoveryPurchaseId,
  recoveryCheckoutParams,
  recoveryCreditConsumption,
  recoveryVipMaintenance,
} from '@/lib/domain/memberships/somble-billing-recovery';

const now = new Date('2026-09-21T18:00:00Z');
const jolie = {
  id: 'cmryg3hyo000zw9wrhuigtu3y',
  email: 'jolielampkin@gmail.com',
};
function membership() {
  return {
    id: 'cms446vaw0069l709pi1gr4yo',
    userId: jolie.id,
    purchaseId: null,
    stripeSubscriptionId: null,
    status: 'ACTIVE',
    product: {
      id: 'imported',
      slug: 'somble-og-rhyze-tribe',
      kind: 'LIMITED_MEMBERSHIP',
      billingInterval: 'MONTHLY',
    },
  };
}
describe('bounded Somble recovery', () => {
  it('keeps recovered VIP standard access purchase-backed and stops calendar grants after paid access ends', () => {
    const m = {
      userId: 'cmryg3hyn000uw9wrjgudtj7l',
      id: 'cms446vbs006fl709vf1ay2ev',
      purchaseId: 'somble-september-2026-v1:cms446vbs006fl709vf1ay2ev',
      currentPeriodEnd: new Date('2026-10-04T16:00Z'),
    };
    expect(recoveryVipMaintenance(m, new Date('2026-10-01T04:00Z'))).toEqual({
      purchaseOwnsClasses: true,
      benefitsEligible: true,
    });
    expect(recoveryVipMaintenance(m, new Date('2026-10-04T16:00Z'))).toEqual({
      purchaseOwnsClasses: true,
      benefitsEligible: false,
    });
    expect(recoveryVipMaintenance({ ...m, purchaseId: null }, now)).toEqual({
      purchaseOwnsClasses: false,
      benefitsEligible: true,
    });
  });
  it('offers only the reviewed identity and unchanged legacy membership', () => {
    expect(eligibleRecovery(jolie, [membership()], now)?.amountCents).toBe(
      9200,
    );
    expect(
      eligibleRecovery(
        { ...jolie, email: 'other@example.com' },
        [membership()],
        now,
      ),
    ).toBeNull();
    expect(
      eligibleRecovery(jolie, [{ ...membership(), purchaseId: 'paid' }], now),
    ).toBeNull();
    expect(
      eligibleRecovery(
        jolie,
        [{ ...membership(), stripeSubscriptionId: 'sub_paid' }],
        now,
      ),
    ).toBeNull();
    expect(
      eligibleRecovery(
        jolie,
        [
          {
            ...membership(),
            product: { ...membership().product, slug: 'wrong' },
          },
        ],
        now,
      ),
    ).toBeNull();
    expect(
      eligibleRecovery(
        jolie,
        [membership(), { ...membership(), id: 'another' }],
        now,
      ),
    ).toBeNull();
    expect(recoveryForUser('unknown')).toBeNull();
  });
  it('does not infer extra arrears after the October boundary', () => {
    expect(
      eligibleRecovery(jolie, [membership()], new Date('2026-10-03T16:00:00Z')),
    ).toBeNull();
    expect(
      eligibleRecovery(jolie, [membership()], new Date('2026-10-01T16:00:00Z')),
    ).toBeNull();
  });
  it.each([
    ['cmryg3hyo000zw9wrhuigtu3y', 9200, '2026-10-03T16:00:00.000Z'],
    ['cmryg3hyn000uw9wrjgudtj7l', 19900, '2026-10-04T16:00:00.000Z'],
    ['cmryg3hy70000w9wrszwya76i', 19900, '2026-10-03T16:00:00.000Z'],
  ])(
    'charges the approved September amount and preserves anniversary for %s',
    (id, amount, anchor) => {
      const recovery = recoveryForUser(id)!;
      const params = recoveryCheckoutParams(recovery, {
        customerId: 'cus_verified',
        purchaseId: recoveryPurchaseId(recovery),
        origin: 'https://rhyzefit.com',
        expiresAt: 1790017200,
      });
      expect(params.mode).toBe('subscription');
      expect(
        params.line_items?.map((item) => item.price_data?.unit_amount),
      ).toEqual([amount, amount]);
      expect(params.subscription_data?.trial_end).toBe(
        new Date(anchor).getTime() / 1000,
      );
      expect(params.payment_method_collection).toBe('always');
      expect(params.allow_promotion_codes).toBe(false);
      expect(params.success_url).toContain('result=success');
      expect(params.success_url).toContain('session_id={CHECKOUT_SESSION_ID}');
      expect(params.cancel_url).not.toBe(params.success_url);
      expect(params.subscription_data?.metadata?.purchaseId).toBe(
        recoveryPurchaseId(recovery),
      );
    },
  );
  it('counts only net OG-funded usage, not complimentary or separately paid bookings', () => {
    const entries = [
      {
        creditAccountId: 'cmsoujv7l001dkz09yrcubhj5',
        bookingId: 'og',
        quantity: -1,
        startAt: new Date('2026-09-14T15:00:00Z'),
      },
      {
        creditAccountId: 'cmsoujv7l001dkz09yrcubhj5',
        bookingId: 'cancelled',
        quantity: -1,
        startAt: new Date('2026-09-15T15:00:00Z'),
      },
      {
        creditAccountId: 'cmsoujv7l001dkz09yrcubhj5',
        bookingId: 'cancelled',
        quantity: 1,
        startAt: new Date('2026-09-15T15:00:00Z'),
      },
      {
        creditAccountId: 'cmu8knx1i0001jq09k1wqfy9x',
        bookingId: 'free',
        quantity: -1,
        startAt: new Date('2026-09-19T15:00:00Z'),
      },
      {
        creditAccountId: 'cmsoujv7l001dkz09yrcubhj5',
        bookingId: 'august',
        quantity: -1,
        startAt: new Date('2026-08-14T15:00:00Z'),
      },
    ];
    expect(recoveryCreditConsumption(recoveryForUser(jolie.id)!, entries)).toBe(
      1,
    );
    expect(recoveryCreditConsumption(recoveryForUser(jolie.id)!, [])).toBe(0);
  });
});
