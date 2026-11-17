import { TRIAL_POLICY_VERSION } from '@/lib/domain/memberships/trial-policy-consent';
import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import { refundReviewSnapshot } from './refund-review';
import type { FinancialProvider, FinancialOperation } from './refund-review';
import type { BoundReceipt } from './refund-review-policy';
const id = (value: string | { id: string } | null) =>
  typeof value === 'string' ? value : (value?.id ?? '');
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
/** Full-remainder USD refunds; recurring invoices retain service and billing. */
export function stripeFinancialProvider(stripe: Stripe): FinancialProvider {
  async function accountMatches(op: FinancialOperation) {
    const account = await stripe.accounts.retrieve();
    if (account.id !== op.payload.accountId)
      throw Error('Provider account changed');
  }
  return {
    async inspect(tx, paymentRecordId, kind) {
      const payment = await tx.paymentRecord.findUniqueOrThrow({
        where: { id: paymentRecordId },
      });
      if (
        !payment.stripePaymentIntentId ||
        !payment.stripeCustomerId ||
        payment.commerceOrderId
      )
        throw Error('Payment not supported by this bounded workflow');
      if (
        await tx.commerceOrder.count({
          where: { stripePaymentIntentId: payment.stripePaymentIntentId },
        })
      )
        throw Error(
          'Commerce payment requires the shared commerce refund workflow',
        );
      const purchase = payment.purchaseId
        ? await tx.purchase.findUnique({
            where: { id: payment.purchaseId },
            include: { membership: true },
          })
        : null;
      const membership = payment.membershipId
        ? await tx.membership.findUnique({
            where: { id: payment.membershipId },
          })
        : purchase?.membership;
      const subscriptionId =
        payment.stripeSubscriptionId || membership?.stripeSubscriptionId;
      const recurring = Boolean(subscriptionId);
      if (
        recurring &&
        (kind !== 'REFUND' ||
          !payment.stripeInvoiceId ||
          !membership ||
          payment.membershipId !== membership.id ||
          payment.stripeSubscriptionId !== subscriptionId ||
          membership.userId !== payment.userId ||
          membership.stripeSubscriptionId !== subscriptionId ||
          (purchase && purchase.userId !== payment.userId))
      )
        throw Error('Exact recurring invoice and membership binding required');
      if (
        purchase &&
        !recurring &&
        (purchase.stripePaymentIntentId !== payment.stripePaymentIntentId ||
          purchase.amountCents !== payment.amountCents ||
          purchase.refundedAmountCents !== payment.refundedAmountCents ||
          purchase.currency !== payment.currency ||
          purchase.userId !== payment.userId)
      )
        throw Error('Purchase receipt binding mismatch');
      const account = await stripe.accounts.retrieve();
      const pi = await stripe.paymentIntents.retrieve(
        payment.stripePaymentIntentId,
      );
      if (
        pi.id !== payment.stripePaymentIntentId ||
        !pi.latest_charge ||
        pi.status !== 'succeeded' ||
        pi.amount_received !== payment.amountCents ||
        pi.currency !== payment.currency ||
        id(pi.customer) !== payment.stripeCustomerId
      )
        throw Error('Original payment mismatch');
      if (
        recurring &&
        purchase?.stripePaymentIntentId === payment.stripePaymentIntentId
      )
        throw Error(
          'Original subscription purchase requires explicit service disposition; renewal-only refund workflow',
        );
      if (recurring) {
        const invoice = await stripe.invoices.retrieve(
          payment.stripeInvoiceId!,
        );
        if (
          invoice.id !== payment.stripeInvoiceId ||
          invoice.status !== 'paid' ||
          id(invoice.customer) !== payment.stripeCustomerId ||
          invoice.livemode !== pi.livemode ||
          invoice.currency !== payment.currency ||
          id(invoice.parent?.subscription_details?.subscription ?? null) !==
            subscriptionId
        )
          throw Error('Recurring invoice binding mismatch');
        const matches: Stripe.InvoicePayment[] = [];
        for await (const entry of stripe.invoicePayments.list({
          invoice: invoice.id,
          limit: 100,
        })) {
          if (
            entry.payment.type === 'payment_intent' &&
            id(entry.payment.payment_intent ?? null) === pi.id
          )
            matches.push(entry);
        }
        if (
          matches.length !== 1 ||
          matches[0].status !== 'paid' ||
          id(matches[0].invoice) !== invoice.id ||
          matches[0].amount_paid !== payment.amountCents ||
          matches[0].currency !== payment.currency ||
          matches[0].livemode !== pi.livemode
        )
          throw Error('Exact paid invoice payment required');
      }
      const charge = await stripe.charges.retrieve(id(pi.latest_charge));
      if (
        charge.id !== id(pi.latest_charge) ||
        !charge.paid ||
        !charge.captured ||
        charge.amount_captured !== payment.amountCents ||
        id(charge.customer) !== payment.stripeCustomerId ||
        charge.disputed ||
        id(charge.payment_intent) !== pi.id ||
        charge.amount !== payment.amountCents ||
        charge.currency !== 'usd'
      )
        throw Error('Captured original charge required');
      const refunds: Stripe.Refund[] = [];
      for await (const refund of stripe.refunds.list({
        charge: charge.id,
        limit: 100,
      }))
        refunds.push(refund);
      if (
        refunds.some(
          (r) =>
            r.status !== 'succeeded' &&
            r.status !== 'failed' &&
            r.status !== 'canceled',
        )
      )
        throw Error('Pending refund requires reconciliation');
      const refunded = refunds
        .filter((r) => r.status === 'succeeded')
        .reduce((sum, r) => sum + r.amount, 0);
      if (
        refunded !== payment.refundedAmountCents ||
        refunded !== charge.amount_refunded
      )
        throw Error('Original refund accounting needs reconciliation');
      let amountCents = payment.amountCents - refunded;
      let cardId = id(pi.payment_method);
      let evidence = JSON.stringify({
        refunded,
        refunds: refunds.map((r) => [r.id, r.amount, r.status]).sort(),
      });
      if (kind === 'REFUND')
        evidence += await refundReviewSnapshot(tx, payment);
      if (kind === 'REPLACEMENT') {
        if (
          payment.kind !== 'NO_SHOW_FEE' ||
          payment.amountCents !== 1000 ||
          refunded !== 1000 ||
          payment.status !== 'REFUNDED' ||
          !payment.bookingId ||
          !payment.userId
        )
          throw Error('Exactly one fully refunded $10 no-show fee required');
        const booking = await tx.booking.findUniqueOrThrow({
          where: { id: payment.bookingId },
          include: { attendance: true },
        });
        if (
          booking.attendance?.status !== 'NO_SHOW' ||
          booking.userId !== payment.userId
        )
          throw Error('Attendance changed');
        const snapshot = object(booking.policySnapshot);
        if (typeof snapshot.creditAccountId !== 'string')
          throw Error('Exact original policy purchase binding required');
        const credits = await tx.creditAccount.findUniqueOrThrow({
          where: { id: snapshot.creditAccountId },
          include: { sourcePurchase: true },
        });
        const originalPurchase = credits.sourcePurchase;
        if (
          !originalPurchase ||
          originalPurchase.userId !== payment.userId ||
          !originalPurchase.stripePaymentIntentId ||
          originalPurchase.status !== 'PAID' ||
          originalPurchase.refundedAmountCents !== 0 ||
          object(originalPurchase.policyAcceptance)
            .savedPaymentMethodConsent !== true ||
          !originalPurchase.policyAcceptedAt ||
          object(originalPurchase.policyAcceptance).version !==
            TRIAL_POLICY_VERSION ||
          object(originalPurchase.policyAcceptance).noShowFeeCents !== 1000
        )
          throw Error('Current original purchase consent proof required');
        const source = await stripe.paymentIntents.retrieve(
          originalPurchase.stripePaymentIntentId,
        );
        cardId = id(source.payment_method);
        if (
          source.status !== 'succeeded' ||
          source.amount_received !== originalPurchase.amountCents ||
          source.currency !== originalPurchase.currency ||
          source.livemode !== pi.livemode ||
          id(source.customer) !== payment.stripeCustomerId ||
          cardId !== id(pi.payment_method)
        )
          throw Error('Original card provenance mismatch');
        const card = await stripe.paymentMethods.retrieve(cardId);
        if (
          card.type !== 'card' ||
          id(card.customer) !== payment.stripeCustomerId
        )
          throw Error('Original card no longer attached');
        // Exhaust the customer intent listing, including uncaptured/pending intents.
        // Unknown attribution is a blocker, not permission to assume an unrelated charge.
        const attempts: string[] = [];
        for await (const attempt of stripe.paymentIntents.list({
          customer: payment.stripeCustomerId,
          limit: 100,
        })) {
          attempts.push(attempt.id);
          if (
            attempt.id === pi.id ||
            attempt.id === source.id ||
            attempt.status === 'canceled'
          )
            continue;
          if (
            !attempt.metadata.bookingId ||
            attempt.metadata.bookingId === booking.id
          )
            throw Error(
              'Competing or unattributed customer attempt requires review',
            );
          if (attempt.status !== 'succeeded')
            throw Error('Pending customer attempt requires review');
        }
        const otherLocal = await tx.paymentRecord.count({
          where: {
            bookingId: booking.id,
            id: { not: payment.id },
            kind: {
              in: ['NO_SHOW_FEE', 'LATE_CANCELLATION_FEE', 'TRANSFER_FEE'],
            },
            status: { not: 'FAILED' },
          },
        });
        if (otherLocal) throw Error('Another local fee exists');
        evidence += JSON.stringify({
          bookingVersion: booking.updatedAt.toISOString(),
          attendance: booking.attendance.updatedAt?.toISOString(),
          policy: booking.policySnapshot,
          consent: originalPurchase.policyAcceptance,
          attempts: attempts.sort(),
          source: source.id,
          card: card.id,
        });
        amountCents = 1000;
      }
      if (amountCents <= 0) throw Error('No refundable balance');
      return {
        ...(recurring
          ? {
              servicePolicy: 'PRESERVE_RECURRING_SERVICE' as const,
              subscriptionId: subscriptionId!,
              invoiceId: payment.stripeInvoiceId!,
            }
          : {}),
        paymentIntentId: pi.id,
        chargeId: charge.id,
        customerId: payment.stripeCustomerId,
        cardId,
        accountId: account.id,
        livemode: pi.livemode,
        bookingId: payment.bookingId,
        userId: payment.userId,
        amountCents,
        currency: 'usd',
        originalAmountCents: payment.amountCents,
        refundedBeforeCents: refunded,
        evidence: createHash('sha256').update(evidence).digest('hex'),
      };
    },
    async submit(op,beforeSubmission) {
      await accountMatches(op);
      await beforeSubmission();
      if (op.kind === 'REFUND') {
        return (
          await stripe.refunds.create(
            {
              charge: op.payload.chargeId,
              amount: op.amountCents,
              metadata: { approvedOperationId: op.id },
            },
            {
              idempotencyKey: op.providerKey,
              maxNetworkRetries: 0,
              timeout: 20000,
            },
          )
        ).id;
      }
      return (
        await stripe.paymentIntents.create(
          {
            customer: op.payload.customerId,
            payment_method: op.payload.cardId,
            amount: op.amountCents,
            currency: op.currency,
            confirm: true,
            off_session: true,
            metadata: {
              approvedOperationId: op.id,
              bookingId: op.payload.bookingId!,
              memberId: op.payload.userId!,
              originalPaymentRecordId: op.paymentRecordId,
              feeType: 'NO_SHOW',
            },
          },
          {
            idempotencyKey: op.providerKey,
            maxNetworkRetries: 0,
            timeout: 20000,
          },
        )
      ).id;
    },
    async receipt(op): Promise<BoundReceipt | null> {
      await accountMatches(op);
      if (op.kind === 'REFUND') {
        const matches: Stripe.Refund[] = [];
        if (op.providerId)
          matches.push(await stripe.refunds.retrieve(op.providerId));
        else
          for await (const refund of stripe.refunds.list({
            charge: op.payload.chargeId,
            limit: 100,
          }))
            if (refund.metadata?.approvedOperationId === op.id)
              matches.push(refund);
        if (!matches.length) return null;
        if (matches.length !== 1) throw Error('Ambiguous refund receipt');
        const refund = matches[0];
        if (op.providerId && refund.id !== op.providerId)
          throw Error('Refund provider identity mismatch');
        return {
          id: refund.id,
          operationId: refund.metadata?.approvedOperationId ?? '',
          paymentIntentId: id(refund.payment_intent),
          chargeId: id(refund.charge),
          amountCents: refund.amount,
          currency: refund.currency,
          status: refund.status ?? 'pending',
        };
      }
      const matches: Stripe.PaymentIntent[] = [];
      if (op.providerId)
        matches.push(await stripe.paymentIntents.retrieve(op.providerId));
      else
        for await (const intent of stripe.paymentIntents.list({
          customer: op.payload.customerId,
          limit: 100,
        }))
          if (intent.metadata.approvedOperationId === op.id)
            matches.push(intent);
      if (!matches.length) return null;
      if (matches.length !== 1) throw Error('Ambiguous replacement receipt');
      const pi = matches[0];
      if (op.providerId && pi.id !== op.providerId)
        throw Error('Replacement provider identity mismatch');
      if (
        pi.livemode !== op.payload.livemode ||
        id(pi.customer) !== op.payload.customerId ||
        id(pi.payment_method) !== op.payload.cardId ||
        pi.metadata.bookingId !== op.payload.bookingId ||
        pi.metadata.originalPaymentRecordId !== op.paymentRecordId
      )
        throw Error('Replacement binding mismatch');
      const charge = pi.latest_charge
        ? await stripe.charges.retrieve(id(pi.latest_charge))
        : null;
      if (
        pi.status === 'succeeded' &&
        (!charge?.paid ||
          !charge.captured ||
          charge.amount !== op.amountCents ||
          pi.amount_received !== op.amountCents ||
          id(charge.payment_intent) !== pi.id)
      )
        throw Error('Replacement capture mismatch');
      return {
        id: pi.id,
        operationId: pi.metadata.approvedOperationId,
        paymentIntentId: pi.id,
        chargeId: charge?.id ?? '',
        amountCents: pi.amount,
        currency: pi.currency,
        status: pi.status,
      };
    },
  };
}
