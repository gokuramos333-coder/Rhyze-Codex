import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReconciledRefundRecords } from '@/lib/admin/reconciled-financials';
import { assertNoCashRefundForBooking } from '@/lib/domain/bookings/cash-refund-guard';
import { refundCommerceOrderFullRemainder } from '@/lib/payments/commerce-refunds';
import { processStripeEvent } from '@/lib/payments/webhook-processor';

const url = process.env.CALLBACK_TEST_DATABASE_URL;
if (
  url &&
  (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/callback_test')
) {
  throw new Error(
    'Commerce refund integration tests require the explicit disposable local callback_test database',
  );
}

function stripe(status: 'succeeded' | 'pending' = 'succeeded', chargeRefunds: any[] = []) {
  return {
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'pi_refund_integration',
        status: 'succeeded',
        amount: 3000,
        currency: 'usd',
        latest_charge: 'ch_refund_integration',
        metadata: { commerceOrderId: 'commerce-refund-order' },
      }),
    },
    charges: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'ch_refund_integration',
        status: 'succeeded',
        paid: true,
        amount: 3000,
        amount_refunded: chargeRefunds
          .filter((refund) => refund.status === 'succeeded')
          .reduce((sum, refund) => sum + refund.amount, 0),
        currency: 'usd',
        payment_intent: 'pi_refund_integration',
        metadata: { commerceOrderId: 'commerce-refund-order' },
        refunds: { data: chargeRefunds },
      }),
    },
    refunds: {
      list: vi.fn().mockResolvedValue({ data: chargeRefunds, has_more: false }),
      create: vi.fn().mockResolvedValue({
        id: 're_refund_integration',
        amount: 3000,
        status,
        charge: 'ch_refund_integration',
        payment_intent: 'pi_refund_integration',
        currency: 'usd',
      }),
      retrieve: vi.fn().mockResolvedValue({
        id: 're_refund_integration',
        amount: 3000,
        status,
        charge: 'ch_refund_integration',
        payment_intent: 'pi_refund_integration',
        currency: 'usd',
      }),
    },
  };
}

if (!url) {
  describe.skip('commerce event refunds on PostgreSQL', () => {
    it('requires a disposable callback_test database', () => {});
  });
} else {
  describe('commerce event refunds on PostgreSQL', () => {
    const db = new PrismaClient({ datasourceUrl: url });
    const prefix = `commerce-refund-${randomUUID()}`;
    const ids = {
      owner: `${prefix}-owner`,
      member: `${prefix}-member`,
      category: `${prefix}-category`,
      template: `${prefix}-template`,
      occurrence: `${prefix}-occurrence`,
      order: 'commerce-refund-order',
      booking: `${prefix}-booking`,
      secondOrder: `${prefix}-second-order`,
      product: `${prefix}-product`,
      trialProduct: `${prefix}-trial-product`,
      trialPurchase: `${prefix}-trial-purchase`,
      trialCreditAccount: `${prefix}-trial-credit-account`,
      purchase: `${prefix}-purchase`,
      membership: `${prefix}-membership`,
      creditAccount: `${prefix}-credit-account`,
    };
    const operationKey = 'commerce-refund-full:commerce-refund-order';

    function refundInput() {
      return {
        orderId: ids.order,
        actorId: ids.owner,
        memberUserId: ids.member,
        reason: 'Studio postponed event',
        confirmation: 'REFUND',
      };
    }

    function providerRefund(id: string, metadata: Record<string, string> = {}) {
      return {
        id,
        amount: 3000,
        status: 'succeeded',
        charge: 'ch_refund_integration',
        payment_intent: 'pi_refund_integration',
        currency: 'usd',
        metadata,
      };
    }

    function setProviderRefunds(
      s: ReturnType<typeof stripe>,
      refunds: ReturnType<typeof providerRefund>[],
    ) {
      s.charges.retrieve.mockResolvedValue({
        id: 'ch_refund_integration',
        status: 'succeeded',
        paid: true,
        amount: 3000,
        amount_refunded: refunds
          .filter((refund) => refund.status === 'succeeded')
          .reduce((sum, refund) => sum + refund.amount, 0),
        currency: 'usd',
        payment_intent: 'pi_refund_integration',
        metadata: { commerceOrderId: 'commerce-refund-order' },
        refunds: { data: refunds },
      });
      s.refunds.list.mockResolvedValue({ data: refunds, has_more: false });
    }

    function clientFailingInteractiveTransactionAfterCallback(
      targetCall: number,
      error: Error,
    ) {
      let calls = 0;
      const originalTransaction = db.$transaction.bind(db) as any;
      const client = new Proxy(db, {
        get(target, property, receiver) {
          if (property !== '$transaction') {
            const value = Reflect.get(target, property, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
          }
          return async (arg: any, options?: any) => {
            if (typeof arg !== 'function') {
              return originalTransaction(arg, options);
            }
            calls += 1;
            const currentCall = calls;
            return originalTransaction(async (tx: any) => {
              const result = await arg(tx);
              if (currentCall === targetCall) {
                throw error;
              }
              return result;
            }, options);
          };
        },
      }) as PrismaClient;
      return {
        client,
        calls: () => calls,
      };
    }

    async function reconciledRefundRecords() {
      const [order, commerceRefunds, paymentRecords] = await Promise.all([
        db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } }),
        db.commerceRefund.findMany({
          where: { commerceOrderId: ids.order },
          orderBy: { createdAt: 'asc' },
        }),
        db.paymentRecord.findMany({
          where: { commerceOrderId: ids.order },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
      return buildReconciledRefundRecords({
        purchases: [],
        commerceOrders: [order],
        purchaseRefunds: [],
        commerceRefunds,
        paymentRecords,
      });
    }

    function checkoutReplayEvent(eventId: string) {
      const created = Math.floor(
        new Date('2026-09-20T12:00:00Z').getTime() / 1000,
      );
      return {
        id: eventId,
        type: 'checkout.session.completed',
        created,
        livemode: false,
        data: {
          object: {
            id: `${eventId}-session`,
            payment_status: 'paid',
            customer: 'cus_refund_integration',
            payment_intent: 'pi_refund_integration',
            created,
            metadata: { commerceOrderId: ids.order },
            customer_details: {
              name: 'Synthetic Member',
              email: `${ids.member}@example.test`,
            },
            customer_email: `${ids.member}@example.test`,
          },
        },
      };
    }

    function chargeRefundedEvent(eventId: string) {
      return {
        id: eventId,
        type: 'charge.refunded',
        created: Math.floor(
          new Date('2026-09-21T12:00:00Z').getTime() / 1000,
        ),
        livemode: false,
        data: {
          object: {
            id: 'ch_refund_integration',
            payment_intent: 'pi_refund_integration',
            refunded: true,
            amount_refunded: 3000,
          },
        },
      };
    }

    async function expectCreditGuardBlocked() {
      await expect(
        db.$transaction(async (tx) =>
          assertNoCashRefundForBooking(tx, {
            id: ids.booking,
            occurrenceId: ids.occurrence,
            userId: ids.member,
          }),
        ),
      ).rejects.toThrow(/cash refund/i);
    }

    async function clean() {
      await db.emailMessage.deleteMany({
        where: {
          OR: [
            { userId: { in: [ids.member, ids.owner] } },
            { dedupeKey: { contains: prefix } },
            { dedupeKey: { contains: ids.order } },
          ],
        },
      });
      await db.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: [ids.member, ids.owner] } },
            { entityId: { in: [ids.order, ids.booking] } },
          ],
        },
      });
      await db.attendanceRecord.deleteMany({
        where: { OR: [{ bookingId: ids.booking }, { userId: ids.member }] },
      });
      await db.creditLedgerEntry.deleteMany({
        where: {
          OR: [
            { bookingId: ids.booking },
            {
              creditAccountId: {
                in: [ids.creditAccount, ids.trialCreditAccount],
              },
            },
          ],
        },
      });
      await db.booking.deleteMany({
        where: { OR: [{ id: ids.booking }, { userId: ids.member }] },
      });
      await db.paymentRecord.deleteMany({
        where: {
          OR: [
            { commerceOrderId: { in: [ids.order, ids.secondOrder] } },
            { userId: ids.member },
          ],
        },
      });
      await db.commerceRefund.deleteMany({
        where: { commerceOrderId: { in: [ids.order, ids.secondOrder] } },
      });
      await db.commerceOrder.deleteMany({
        where: { id: { in: [ids.order, ids.secondOrder] } },
      });
      await db.membership.deleteMany({ where: { id: ids.membership } });
      await db.creditAccount.deleteMany({
        where: { id: { in: [ids.creditAccount, ids.trialCreditAccount] } },
      });
      await db.purchase.deleteMany({
        where: { id: { in: [ids.purchase, ids.trialPurchase] } },
      });
      await db.product.deleteMany({
        where: { id: { in: [ids.product, ids.trialProduct] } },
      });
      await db.classOccurrence.deleteMany({ where: { id: ids.occurrence } });
      await db.classTemplate.deleteMany({ where: { id: ids.template } });
      await db.classCategory.deleteMany({ where: { id: ids.category } });
      await db.user.deleteMany({
        where: { id: { in: [ids.member, ids.owner] } },
      });
    }

    beforeEach(async () => {
      await clean();
      await db.user.createMany({
        data: [
          {
            id: ids.owner,
            email: `${ids.owner}@example.test`,
            role: 'OWNER',
          },
          {
            id: ids.member,
            email: `${ids.member}@example.test`,
            name: 'Synthetic Member',
          },
        ],
      });
      await db.classCategory.create({
        data: {
          id: ids.category,
          slug: ids.category,
          name: 'Synthetic events',
        },
      });
      await db.classTemplate.create({
        data: {
          id: ids.template,
          categoryId: ids.category,
          name: 'Synthetic event',
          slug: ids.template,
          description: 'Test only',
          durationMinutes: 60,
          defaultCapacity: 20,
          isEvent: true,
        },
      });
      await db.classOccurrence.create({
        data: {
          id: ids.occurrence,
          templateId: ids.template,
          startAt: new Date('2026-09-26T16:00:00Z'),
          endAt: new Date('2026-09-26T17:00:00Z'),
          capacity: 20,
        },
      });
      await db.product.create({
        data: {
          id: ids.product,
          name: 'Unrelated membership',
          slug: ids.product,
          description: 'Must not change',
          kind: 'MONTHLY_UNLIMITED',
          billingInterval: 'MONTHLY',
          priceCents: 9200,
          isUnlimited: true,
        },
      });
      await db.product.create({
        data: {
          id: ids.trialProduct,
          name: 'Unrelated intro trial',
          slug: ids.trialProduct,
          description: 'Must not change',
          kind: 'INTRO_TRIAL',
          billingInterval: 'ONE_TIME',
          priceCents: 700,
          isUnlimited: true,
          trialDays: 7,
        },
      });
      await db.purchase.create({
        data: {
          id: ids.purchase,
          userId: ids.member,
          productId: ids.product,
          status: 'PAID',
          amountCents: 9200,
          stripePaymentIntentId: `${prefix}-membership-pi`,
          paidAt: new Date('2026-09-01T12:00:00Z'),
        },
      });
      await db.purchase.create({
        data: {
          id: ids.trialPurchase,
          userId: ids.member,
          productId: ids.trialProduct,
          status: 'PAID',
          amountCents: 700,
          stripePaymentIntentId: `${prefix}-trial-pi`,
          paidAt: new Date('2026-09-02T12:00:00Z'),
        },
      });
      await db.membership.create({
        data: {
          id: ids.membership,
          userId: ids.member,
          productId: ids.product,
          purchaseId: ids.purchase,
          status: 'ACTIVE',
          currentPeriodStart: new Date('2026-09-01T12:00:00Z'),
          currentPeriodEnd: new Date('2026-10-01T12:00:00Z'),
        },
      });
      await db.creditAccount.create({
        data: {
          id: ids.creditAccount,
          userId: ids.member,
          sourcePurchaseId: ids.purchase,
          label: 'Unrelated membership',
          isUnlimited: true,
        },
      });
      await db.creditAccount.create({
        data: {
          id: ids.trialCreditAccount,
          userId: ids.member,
          sourcePurchaseId: ids.trialPurchase,
          label: 'Unrelated intro trial',
          isUnlimited: true,
        },
      });
      await db.commerceOrder.create({
        data: {
          id: ids.order,
          userId: ids.member,
          occurrenceId: ids.occurrence,
          kind: 'EVENT',
          status: 'PAID',
          amountCents: 3000,
          currency: 'usd',
          customerEmail: `${ids.member}@example.test`,
          stripePaymentIntentId: 'pi_refund_integration',
          paidAt: new Date('2026-09-20T12:00:00Z'),
          items: {
            create: {
              productReference: 'event',
              name: 'Synthetic event',
              unitAmountCents: 3000,
              quantity: 1,
            },
          },
        },
      });
      await db.paymentRecord.create({
        data: {
          userId: ids.member,
          commerceOrderId: ids.order,
          kind: 'EVENT',
          status: 'SUCCEEDED',
          amountCents: 3000,
          currency: 'usd',
          stripeEventId: `${prefix}-checkout-event`,
          stripePaymentIntentId: 'pi_refund_integration',
        },
      });
      await db.booking.create({
        data: {
          id: ids.booking,
          userId: ids.member,
          occurrenceId: ids.occurrence,
          source: 'STRIPE_EVENT',
        },
      });
      await db.attendanceRecord.create({
        data: {
          bookingId: ids.booking,
          userId: ids.member,
          occurrenceId: ids.occurrence,
          status: 'CHECKED_IN',
        },
      });
      await db.emailMessage.create({
        data: {
          userId: ids.member,
          to: `${ids.member}@example.test`,
          toList: [`${ids.member}@example.test`],
          subject: 'Reminder',
          template: 'CLASS_REMINDER',
          payload: {},
          dedupeKey: `class-reminder:${ids.booking}:${ids.occurrence}`,
        },
      });
    });

    afterAll(async () => {
      await clean();
      await db.$disconnect();
    });

    it('refunds an event order and cleans only the exact linked event booking', async () => {
      await refundCommerceOrderFullRemainder(db, stripe() as never, {
        orderId: ids.order,
        actorId: ids.owner,
        memberUserId: ids.member,
        reason: 'Studio postponed event',
        confirmation: 'REFUND',
      });

      await expect(
        db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } }),
      ).resolves.toMatchObject({
        status: 'REFUNDED',
        refundedAmountCents: 3000,
      });
      await expect(
        db.paymentRecord.findFirstOrThrow({
          where: { commerceOrderId: ids.order },
        }),
      ).resolves.toMatchObject({
        status: 'REFUNDED',
        refundedAmountCents: 3000,
      });
      await expect(
        db.commerceRefund.findFirstOrThrow({
          where: { commerceOrderId: ids.order },
        }),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        stripeRefundId: 're_refund_integration',
      });
      await expect(
        db.booking.findUniqueOrThrow({ where: { id: ids.booking } }),
      ).resolves.toMatchObject({ status: 'CANCELLED' });
      expect(
        await db.attendanceRecord.count({ where: { bookingId: ids.booking } }),
      ).toBe(0);
      await expect(
        db.emailMessage.findUniqueOrThrow({
          where: {
            dedupeKey: `class-reminder:${ids.booking}:${ids.occurrence}`,
          },
        }),
      ).resolves.toMatchObject({ status: 'CANCELLED' });
      await expect(
        db.purchase.findUniqueOrThrow({ where: { id: ids.purchase } }),
      ).resolves.toMatchObject({ status: 'PAID', refundedAmountCents: 0 });
      await expect(
        db.membership.findUniqueOrThrow({ where: { id: ids.membership } }),
      ).resolves.toMatchObject({ status: 'ACTIVE' });
      await expect(
        db.creditAccount.findUniqueOrThrow({
          where: { id: ids.creditAccount },
        }),
      ).resolves.toMatchObject({ validUntil: null });
      await expect(
        db.purchase.findUniqueOrThrow({ where: { id: ids.trialPurchase } }),
      ).resolves.toMatchObject({ status: 'PAID', refundedAmountCents: 0 });
      await expect(
        db.creditAccount.findUniqueOrThrow({
          where: { id: ids.trialCreditAccount },
        }),
      ).resolves.toMatchObject({ validUntil: null });
    });

    it('keeps staff-only notification suppressed through pending recovery and later retries', async () => {
      const pending = stripe('pending');
      await expect(refundCommerceOrderFullRemainder(db, pending as never, {
        ...refundInput(), notifyCustomer: false,
      })).rejects.toMatchObject({ code: 'provider_pending' });
      const succeeded = stripe('succeeded', [providerRefund('re_refund_integration')]);
      await refundCommerceOrderFullRemainder(db, succeeded as never, refundInput());
      await refundCommerceOrderFullRemainder(db, succeeded as never, refundInput());
      expect(succeeded.refunds.create).not.toHaveBeenCalled();
      await expect(db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } }))
        .resolves.toMatchObject({ status: 'REFUNDED', refundedAmountCents: 3000 });
      await expect(db.emailMessage.count({ where: {
        userId: ids.member, template: 'PAYMENT_REFUND_CONFIRMATION',
      } })).resolves.toBe(0);
      await expect(db.auditLog.count({ where: {
        entityId: ids.order, action: 'commerce-refund.notification-suppressed',
      } })).resolves.toBe(1);
    });

    it('reconciles an external refund without emailing when staff-only is selected', async () => {
      const external = providerRefund('re_staff_only_external');
      const provider = stripe('succeeded', [external]);
      await refundCommerceOrderFullRemainder(db, provider as never, {
        ...refundInput(), notifyCustomer: false,
      });
      await refundCommerceOrderFullRemainder(db, provider as never, refundInput());
      expect(provider.refunds.create).not.toHaveBeenCalled();
      await expect(db.emailMessage.count({ where: {
        userId: ids.member, template: 'PAYMENT_REFUND_CONFIRMATION',
      } })).resolves.toBe(0);
    });

    it('rejects a prior event cancellation GRANT before calling Stripe', async () => {
      await db.creditLedgerEntry.create({
        data: {
          creditAccountId: ids.trialCreditAccount,
          bookingId: ids.booking,
          sourceReturnKey: `event-cancellation:${ids.booking}`,
          type: 'GRANT',
          quantity: 1,
          reason: 'Synthetic returned event credit',
        },
      });
      const s = stripe();

      await expect(
        refundCommerceOrderFullRemainder(db, s as never, {
          orderId: ids.order,
          actorId: ids.owner,
          memberUserId: ids.member,
          reason: 'Studio postponed event',
          confirmation: 'REFUND',
        }),
      ).rejects.toMatchObject({ code: 'not_refundable' });

      expect(s.refunds.create).not.toHaveBeenCalled();
      await expect(
        db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } }),
      ).resolves.toMatchObject({ status: 'PAID', refundedAmountCents: 0 });
    });

    it('rejects any existing booking ledger before calling Stripe', async () => {
      await db.creditLedgerEntry.create({
        data: {
          creditAccountId: ids.trialCreditAccount,
          bookingId: ids.booking,
          type: 'RESERVE',
          quantity: -1,
          reason: 'Synthetic reservation proves credit-funded ambiguity',
        },
      });
      const s = stripe();

      await expect(
        refundCommerceOrderFullRemainder(db, s as never, {
          orderId: ids.order,
          actorId: ids.owner,
          memberUserId: ids.member,
          reason: 'Studio postponed event',
          confirmation: 'REFUND',
        }),
      ).rejects.toMatchObject({ code: 'not_refundable' });

      expect(s.refunds.create).not.toHaveBeenCalled();
    });

    it('rejects multiple commerce orders for one member occurrence before calling Stripe', async () => {
      await db.commerceOrder.create({
        data: {
          id: ids.secondOrder,
          userId: ids.member,
          occurrenceId: ids.occurrence,
          kind: 'EVENT',
          status: 'PAID',
          amountCents: 3000,
          currency: 'usd',
          customerEmail: `${ids.member}@example.test`,
          stripePaymentIntentId: `${prefix}-second-pi`,
          paidAt: new Date('2026-09-21T12:00:00Z'),
          items: {
            create: {
              productReference: 'event',
              name: 'Synthetic duplicate event',
              unitAmountCents: 3000,
              quantity: 1,
            },
          },
        },
      });
      await db.paymentRecord.create({
        data: {
          userId: ids.member,
          commerceOrderId: ids.secondOrder,
          kind: 'EVENT',
          status: 'SUCCEEDED',
          amountCents: 3000,
          currency: 'usd',
          stripeEventId: `${prefix}-second-checkout-event`,
          stripePaymentIntentId: `${prefix}-second-pi`,
        },
      });
      const s = stripe();

      await expect(
        refundCommerceOrderFullRemainder(db, s as never, {
          orderId: ids.order,
          actorId: ids.owner,
          memberUserId: ids.member,
          reason: 'Studio postponed event',
          confirmation: 'REFUND',
        }),
      ).rejects.toMatchObject({ code: 'not_refundable' });

      expect(s.refunds.create).not.toHaveBeenCalled();
    });

    it('serializes concurrent full refund submissions before provider mutation', async () => {
      const s = stripe();
      s.refunds.create.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          id: 're_refund_integration',
          amount: 3000,
          status: 'succeeded',
          charge: 'ch_refund_integration',
          payment_intent: 'pi_refund_integration',
          currency: 'usd',
        };
      });

      const request = () =>
        refundCommerceOrderFullRemainder(db, s as never, {
          orderId: ids.order,
          actorId: ids.owner,
          memberUserId: ids.member,
          reason: 'Studio postponed event',
          confirmation: 'REFUND',
        });
      const results = await Promise.allSettled([request(), request()]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      expect(s.refunds.create).toHaveBeenCalledOnce();
    });

    it('recovers a fresh pending operation from provider metadata without another provider create', async () => {
      const providerRefund = {
        id: 're_refund_recovered_after_db_failure',
        amount: 3000,
        status: 'succeeded',
        charge: 'ch_refund_integration',
        payment_intent: 'pi_refund_integration',
        currency: 'usd',
        metadata: { operationKey },
      };
      await db.commerceRefund.create({
        data: {
          commerceOrderId: ids.order,
          bookingId: ids.booking,
          amountCents: 3000,
          reason: 'Studio postponed event',
          status: 'PENDING',
          operationKey,
          actorId: ids.owner,
        },
      });
      const s = stripe('succeeded', [providerRefund]);

      await expect(
        refundCommerceOrderFullRemainder(db, s as never, refundInput()),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        stripeRefundId: 're_refund_recovered_after_db_failure',
      });

      expect(s.paymentIntents.retrieve).toHaveBeenCalledOnce();
      expect(s.charges.retrieve).toHaveBeenCalledOnce();
      expect(s.refunds.list).toHaveBeenCalledOnce();
      expect(s.refunds.create).not.toHaveBeenCalled();
      await expect(
        db.commerceRefund.findUniqueOrThrow({ where: { operationKey } }),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        stripeRefundId: 're_refund_recovered_after_db_failure',
        amountCents: 3000,
      });
      await expect(
        db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } }),
      ).resolves.toMatchObject({
        status: 'REFUNDED',
          refundedAmountCents: 3000,
        });
    });

    it('recovers exactly after provider success when the final database transaction rolls back', async () => {
      const createdRefund = providerRefund('re_rollback_after_provider_success', {
        operationKey,
      });
      const s = stripe();
      s.refunds.create.mockResolvedValueOnce(createdRefund);
      s.refunds.retrieve.mockResolvedValueOnce(createdRefund);
      const rollback = new Error('synthetic reconcile rollback after provider success');
      const transactionFailure = clientFailingInteractiveTransactionAfterCallback(
        3,
        rollback,
      );

      await expect(
        refundCommerceOrderFullRemainder(
          transactionFailure.client,
          s as never,
          refundInput(),
        ),
      ).rejects.toThrow(rollback.message);

      expect(transactionFailure.calls()).toBe(3);
      expect(s.refunds.create).toHaveBeenCalledOnce();
      await expect(
        db.commerceRefund.findUniqueOrThrow({ where: { operationKey } }),
      ).resolves.toMatchObject({
        status: 'PENDING',
        stripeRefundId: null,
        amountCents: 3000,
      });
      await expect(
        db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } }),
      ).resolves.toMatchObject({ status: 'PAID', refundedAmountCents: 0 });
      await expect(
        db.paymentRecord.findFirstOrThrow({
          where: { commerceOrderId: ids.order },
        }),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        refundedAmountCents: 0,
      });
      await expect(
        db.booking.findUniqueOrThrow({ where: { id: ids.booking } }),
      ).resolves.toMatchObject({ status: 'CONFIRMED' });
      await expect(
        db.attendanceRecord.count({ where: { bookingId: ids.booking } }),
      ).resolves.toBe(1);
      await expect(
        db.emailMessage.findUniqueOrThrow({
          where: {
            dedupeKey: `class-reminder:${ids.booking}:${ids.occurrence}`,
          },
        }),
      ).resolves.toMatchObject({ status: 'QUEUED' });
      await expect(
        db.emailMessage.count({
          where: {
            dedupeKey: `refund-confirmation:commerce:${ids.order}:3000`,
          },
        }),
      ).resolves.toBe(0);
      await expect(reconciledRefundRecords()).resolves.toHaveLength(0);

      setProviderRefunds(s, [createdRefund]);
      await expect(
        refundCommerceOrderFullRemainder(db, s as never, refundInput()),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        stripeRefundId: 're_rollback_after_provider_success',
        amountCents: 3000,
      });

      expect(s.refunds.create).toHaveBeenCalledOnce();
      await expect(
        db.commerceRefund.findUniqueOrThrow({ where: { operationKey } }),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        stripeRefundId: 're_rollback_after_provider_success',
        amountCents: 3000,
      });
      await expect(
        db.booking.findUniqueOrThrow({ where: { id: ids.booking } }),
      ).resolves.toMatchObject({ status: 'CANCELLED' });
      await expect(
        db.attendanceRecord.count({ where: { bookingId: ids.booking } }),
      ).resolves.toBe(0);
      const refundRecords = await reconciledRefundRecords();
      expect(refundRecords).toHaveLength(1);
      expect(refundRecords[0]).toMatchObject({
        amountCents: 3000,
        commerceOrderId: ids.order,
      });
    });

    it('inspects a fresh pending operation but still refuses a duplicate provider create', async () => {
      await db.commerceRefund.create({
        data: {
          commerceOrderId: ids.order,
          bookingId: ids.booking,
          amountCents: 3000,
          reason: 'Studio postponed event',
          status: 'PENDING',
          operationKey,
          actorId: ids.owner,
        },
      });
      const s = stripe();

      await expect(
        refundCommerceOrderFullRemainder(db, s as never, refundInput()),
      ).rejects.toMatchObject({ code: 'provider_pending' });

      expect(s.paymentIntents.retrieve).toHaveBeenCalledOnce();
      expect(s.charges.retrieve).toHaveBeenCalledOnce();
      expect(s.refunds.list).toHaveBeenCalledOnce();
      expect(s.refunds.create).not.toHaveBeenCalled();
      await expect(
        db.commerceRefund.findUniqueOrThrow({ where: { operationKey } }),
      ).resolves.toMatchObject({
        status: 'PENDING',
        stripeRefundId: null,
      });
    });

    it('retires the pending operation placeholder when an external provider refund already fully refunded the charge', async () => {
      const externalRefund = {
        id: 're_external_full_refund',
        amount: 3000,
        status: 'succeeded',
        charge: 'ch_refund_integration',
        payment_intent: 'pi_refund_integration',
        currency: 'usd',
        metadata: {},
      };
      await db.commerceRefund.create({
        data: {
          commerceOrderId: ids.order,
          bookingId: ids.booking,
          amountCents: 3000,
          reason: 'Studio postponed event',
          status: 'PENDING',
          operationKey,
          actorId: ids.owner,
        },
      });
      const s = stripe('succeeded', [externalRefund]);

      await expect(
        refundCommerceOrderFullRemainder(db, s as never, refundInput()),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        stripeRefundId: null,
      });

      expect(s.refunds.create).not.toHaveBeenCalled();
      const operationPlaceholder = await db.commerceRefund.findUniqueOrThrow({
        where: { operationKey },
      });
      expect(operationPlaceholder.stripeRefundId).toBeNull();
      expect(operationPlaceholder.status).not.toBe('PENDING');
      expect(operationPlaceholder.status).not.toBe('SUCCEEDED');
      await expect(
        db.commerceRefund.findUniqueOrThrow({
          where: { stripeRefundId: 're_external_full_refund' },
        }),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        amountCents: 3000,
        operationKey: 'provider-commerce-refund:re_external_full_refund',
      });
      await expect(
        db.commerceRefund.count({
          where: { commerceOrderId: ids.order, status: 'PENDING' },
        }),
      ).resolves.toBe(0);

      const order = await db.commerceOrder.findUniqueOrThrow({
        where: { id: ids.order },
      });
      const commerceRefunds = await db.commerceRefund.findMany({
        where: { commerceOrderId: ids.order },
      });
      const refundRecords = buildReconciledRefundRecords({
        purchases: [],
        commerceOrders: [order],
        purchaseRefunds: [],
        commerceRefunds,
        paymentRecords: [],
      });
      expect(refundRecords).toHaveLength(1);
      expect(refundRecords[0]).toMatchObject({
        amountCents: 3000,
        commerceOrderId: ids.order,
      });
      await expect(
        db.$transaction(async (tx) =>
          assertNoCashRefundForBooking(tx, {
            id: ids.booking,
            occurrenceId: ids.occurrence,
            userId: ids.member,
          }),
        ),
      ).rejects.toThrow(/cash refund/i);
    });

    it('reconciles an external full refund from no initial placeholder, retries idempotently, and ignores real webhook replay', async () => {
      const externalRefund = providerRefund('re_external_original_full_refund');
      const s = stripe('succeeded', [externalRefund]);

      await expect(
        db.commerceRefund.count({ where: { commerceOrderId: ids.order } }),
      ).resolves.toBe(0);
      await expect(
        refundCommerceOrderFullRemainder(db, s as never, refundInput()),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        stripeRefundId: null,
        amountCents: 3000,
      });

      expect(s.refunds.create).not.toHaveBeenCalled();
      let refunds = await db.commerceRefund.findMany({
        where: { commerceOrderId: ids.order },
        orderBy: { createdAt: 'asc' },
      });
      expect(refunds).toHaveLength(2);
      expect(
        refunds.filter(
          (refund) => refund.stripeRefundId === 're_external_original_full_refund',
        ),
      ).toHaveLength(1);
      expect(refunds.filter((refund) => refund.stripeRefundId === null)).toHaveLength(1);
      expect(
        refunds.some((refund) => refund.stripeRefundId?.includes('fake')),
      ).toBe(false);
      expect(
        refunds.some((refund) => refund.stripeRefundId?.includes('placeholder')),
      ).toBe(false);
      await expect(
        db.commerceRefund.findUniqueOrThrow({ where: { operationKey } }),
      ).resolves.toMatchObject({
        status: 'RECONCILED',
        providerStatus: 'RECONCILED',
        stripeRefundId: null,
        amountCents: 3000,
      });
      await expect(
        db.commerceRefund.findUniqueOrThrow({
          where: { stripeRefundId: 're_external_original_full_refund' },
        }),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        amountCents: 3000,
        operationKey: 'provider-commerce-refund:re_external_original_full_refund',
      });
      await expect(
        db.commerceRefund.count({
          where: { commerceOrderId: ids.order, status: 'PENDING' },
        }),
      ).resolves.toBe(0);

      let refundRecords = await reconciledRefundRecords();
      expect(refundRecords).toHaveLength(1);
      expect(refundRecords[0]).toMatchObject({
        amountCents: 3000,
        commerceOrderId: ids.order,
      });
      expect(
        refundRecords.reduce((sum, record) => sum + record.amountCents, 0),
      ).toBe(3000);
      await expectCreditGuardBlocked();

      const countsAfterFirstReconciliation = {
        bookings: await db.booking.count({
          where: { id: ids.booking, status: 'CANCELLED' },
        }),
        paymentRecords: await db.paymentRecord.count({
          where: { commerceOrderId: ids.order },
        }),
        emails: await db.emailMessage.count({
          where: { userId: ids.member },
        }),
        financialRows: await db.commerceRefund.count({
          where: { commerceOrderId: ids.order },
        }),
      };

      await expect(
        refundCommerceOrderFullRemainder(db, s as never, refundInput()),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        stripeRefundId: null,
        amountCents: 3000,
      });

      await db.$transaction((tx) =>
        processStripeEvent(tx, checkoutReplayEvent(`${prefix}-checkout-replay`) as never),
      );
      await db.$transaction((tx) =>
        processStripeEvent(tx, chargeRefundedEvent(`${prefix}-charge-refunded`) as never),
      );

      expect(s.refunds.create).not.toHaveBeenCalled();
      await expect(
        db.booking.findUniqueOrThrow({ where: { id: ids.booking } }),
      ).resolves.toMatchObject({ status: 'CANCELLED' });
      await expect(
        db.paymentRecord.count({ where: { commerceOrderId: ids.order } }),
      ).resolves.toBe(countsAfterFirstReconciliation.paymentRecords);
      await expect(
        db.emailMessage.count({ where: { userId: ids.member } }),
      ).resolves.toBe(countsAfterFirstReconciliation.emails);
      await expect(
        db.commerceRefund.count({ where: { commerceOrderId: ids.order } }),
      ).resolves.toBe(countsAfterFirstReconciliation.financialRows);
      await expect(
        db.booking.count({ where: { id: ids.booking, status: 'CANCELLED' } }),
      ).resolves.toBe(countsAfterFirstReconciliation.bookings);
      await expect(
        db.commerceRefund.count({
          where: { commerceOrderId: ids.order, status: 'PENDING' },
        }),
      ).resolves.toBe(0);
      refunds = await db.commerceRefund.findMany({
        where: { commerceOrderId: ids.order },
      });
      expect(refunds.filter((refund) => refund.status === 'SUCCEEDED')).toHaveLength(1);
      refundRecords = await reconciledRefundRecords();
      expect(refundRecords).toHaveLength(1);
      expect(
        refundRecords.reduce((sum, record) => sum + record.amountCents, 0),
      ).toBe(3000);
      await expectCreditGuardBlocked();
    });

    it('rolls back external reconciliation retirement and financial updates when the transaction fails, then retries', async () => {
      const externalRefund = providerRefund('re_external_reconcile_rollback');
      const s = stripe('succeeded', [externalRefund]);
      const rollback = new Error('synthetic external reconciliation rollback');
      const transactionFailure = clientFailingInteractiveTransactionAfterCallback(
        2,
        rollback,
      );

      await expect(
        refundCommerceOrderFullRemainder(
          transactionFailure.client,
          s as never,
          refundInput(),
        ),
      ).rejects.toThrow(rollback.message);

      expect(transactionFailure.calls()).toBe(2);
      expect(s.refunds.create).not.toHaveBeenCalled();
      await expect(
        db.commerceRefund.findUniqueOrThrow({ where: { operationKey } }),
      ).resolves.toMatchObject({
        status: 'PENDING',
        stripeRefundId: null,
        amountCents: 3000,
      });
      await expect(
        db.commerceRefund.findUnique({
          where: { stripeRefundId: 're_external_reconcile_rollback' },
        }),
      ).resolves.toBeNull();
      await expect(
        db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } }),
      ).resolves.toMatchObject({ status: 'PAID', refundedAmountCents: 0 });
      await expect(
        db.paymentRecord.findFirstOrThrow({
          where: { commerceOrderId: ids.order },
        }),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        refundedAmountCents: 0,
      });
      await expect(
        db.booking.findUniqueOrThrow({ where: { id: ids.booking } }),
      ).resolves.toMatchObject({ status: 'CONFIRMED' });
      await expect(
        db.emailMessage.findUniqueOrThrow({
          where: {
            dedupeKey: `class-reminder:${ids.booking}:${ids.occurrence}`,
          },
        }),
      ).resolves.toMatchObject({ status: 'QUEUED' });
      await expect(
        db.emailMessage.count({
          where: {
            dedupeKey: `refund-confirmation:commerce:${ids.order}:3000`,
          },
        }),
      ).resolves.toBe(0);
      await expect(reconciledRefundRecords()).resolves.toHaveLength(0);

      await expect(
        refundCommerceOrderFullRemainder(db, s as never, refundInput()),
      ).resolves.toMatchObject({
        status: 'SUCCEEDED',
        stripeRefundId: null,
        amountCents: 3000,
      });

      await expect(
        db.commerceRefund.findUniqueOrThrow({ where: { operationKey } }),
      ).resolves.toMatchObject({
        status: 'RECONCILED',
        providerStatus: 'RECONCILED',
        stripeRefundId: null,
      });
      await expect(
        db.commerceRefund.findUniqueOrThrow({
          where: { stripeRefundId: 're_external_reconcile_rollback' },
        }),
      ).resolves.toMatchObject({ status: 'SUCCEEDED', amountCents: 3000 });
      await expect(
        db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } }),
      ).resolves.toMatchObject({
        status: 'REFUNDED',
        refundedAmountCents: 3000,
      });
      const refundRecords = await reconciledRefundRecords();
      expect(refundRecords).toHaveLength(1);
      expect(refundRecords[0]).toMatchObject({
        amountCents: 3000,
        commerceOrderId: ids.order,
      });
    });

    it('rejects an existing provider refund readback when Stripe returns a different refund id', async () => {
      await db.commerceRefund.create({
        data: {
          commerceOrderId: ids.order,
          bookingId: ids.booking,
          amountCents: 3000,
          reason: 'Studio postponed event',
          status: 'PENDING',
          stripeRefundId: 're_existing_operation_refund',
          operationKey,
          actorId: ids.owner,
        },
      });
      const s = stripe();
      s.refunds.retrieve.mockResolvedValueOnce({
        id: 're_different_refund',
        amount: 3000,
        status: 'succeeded',
        charge: 'ch_refund_integration',
        payment_intent: 'pi_refund_integration',
        currency: 'usd',
      });

      await expect(
        refundCommerceOrderFullRemainder(db, s as never, refundInput()),
      ).rejects.toMatchObject({ code: 'provider_mismatch' });

      expect(s.refunds.create).not.toHaveBeenCalled();
      await expect(
        db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } }),
      ).resolves.toMatchObject({ status: 'PAID', refundedAmountCents: 0 });
    });

    it('rejects an existing provider refund readback when its amount no longer matches the stored operation', async () => {
      await db.commerceRefund.create({
        data: {
          commerceOrderId: ids.order,
          bookingId: ids.booking,
          amountCents: 2500,
          reason: 'Studio postponed event',
          status: 'PENDING',
          stripeRefundId: 're_existing_operation_refund',
          operationKey,
          actorId: ids.owner,
        },
      });
      const s = stripe();
      s.refunds.retrieve.mockResolvedValueOnce({
        id: 're_existing_operation_refund',
        amount: 3000,
        status: 'succeeded',
        charge: 'ch_refund_integration',
        payment_intent: 'pi_refund_integration',
        currency: 'usd',
      });

      await expect(
        refundCommerceOrderFullRemainder(db, s as never, refundInput()),
      ).rejects.toMatchObject({ code: 'provider_mismatch' });

      expect(s.refunds.create).not.toHaveBeenCalled();
      await expect(
        db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } }),
      ).resolves.toMatchObject({ status: 'PAID', refundedAmountCents: 0 });
    });

    it('rejects a created refund readback when Stripe returns a different refund id', async () => {
      const s = stripe();
      s.refunds.create.mockResolvedValueOnce({
        id: 're_created_refund',
        amount: 3000,
        status: 'succeeded',
        charge: 'ch_refund_integration',
        payment_intent: 'pi_refund_integration',
        currency: 'usd',
      });
      s.refunds.retrieve.mockResolvedValueOnce({
        id: 're_wrong_readback',
        amount: 3000,
        status: 'succeeded',
        charge: 'ch_refund_integration',
        payment_intent: 'pi_refund_integration',
        currency: 'usd',
      });

      await expect(
        refundCommerceOrderFullRemainder(db, s as never, refundInput()),
      ).rejects.toMatchObject({ code: 'provider_mismatch' });

      await expect(
        db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } }),
      ).resolves.toMatchObject({ status: 'PAID', refundedAmountCents: 0 });
    });

    it('rejects an existing succeeded operation when another provider refund is still pending', async () => {
      const otherPendingRefund = {
        id: 're_other_pending_refund',
        amount: 500,
        status: 'pending',
        charge: 'ch_refund_integration',
        payment_intent: 'pi_refund_integration',
        currency: 'usd',
      };
      await db.commerceRefund.create({
        data: {
          commerceOrderId: ids.order,
          bookingId: ids.booking,
          amountCents: 3000,
          reason: 'Studio postponed event',
          status: 'PENDING',
          stripeRefundId: 're_existing_operation_refund',
          operationKey,
          actorId: ids.owner,
        },
      });
      const s = stripe('succeeded', [otherPendingRefund]);
      s.refunds.retrieve.mockResolvedValueOnce({
        id: 're_existing_operation_refund',
        amount: 3000,
        status: 'succeeded',
        charge: 'ch_refund_integration',
        payment_intent: 'pi_refund_integration',
        currency: 'usd',
      });

      await expect(
        refundCommerceOrderFullRemainder(db, s as never, refundInput()),
      ).rejects.toMatchObject({ code: 'provider_pending' });

      expect(s.refunds.create).not.toHaveBeenCalled();
      await expect(
        db.commerceOrder.findUniqueOrThrow({ where: { id: ids.order } }),
      ).resolves.toMatchObject({ status: 'PAID', refundedAmountCents: 0 });
    });

    it('serializes the shared booking guard so pending cash refund proof blocks later credit restore', async () => {
      let releaseRefundTransaction!: () => void;
      const refundMayCommit = new Promise<void>((resolve) => {
        releaseRefundTransaction = resolve;
      });
      let refundProofInserted!: () => void;
      const refundProofReady = new Promise<void>((resolve) => {
        refundProofInserted = resolve;
      });

      const refundWriter = db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ids.booking}))`;
        await tx.commerceRefund.create({
          data: {
            commerceOrderId: ids.order,
            bookingId: ids.booking,
            amountCents: 3000,
            reason: 'Concurrent cash refund proof',
            status: 'PENDING',
            operationKey: `${prefix}-concurrent-cash-refund`,
            actorId: ids.owner,
          },
        });
        refundProofInserted();
        await refundMayCommit;
      });

      await refundProofReady;
      const creditRestorer = db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ids.booking}))`;
        await assertNoCashRefundForBooking(tx, {
          id: ids.booking,
          occurrenceId: ids.occurrence,
          userId: ids.member,
        });
        await tx.creditLedgerEntry.create({
          data: {
            creditAccountId: ids.trialCreditAccount,
            bookingId: ids.booking,
            type: 'RESTORE',
            quantity: 1,
            reason: 'Should not be created after pending cash refund proof',
          },
        });
      });

      releaseRefundTransaction();
      await refundWriter;
      await expect(creditRestorer).rejects.toThrow(/cash refund/i);
      await expect(
        db.creditLedgerEntry.findFirst({
          where: {
            bookingId: ids.booking,
            type: 'RESTORE',
            reason: 'Should not be created after pending cash refund proof',
          },
        }),
      ).resolves.toBeNull();
    });
  });
}
