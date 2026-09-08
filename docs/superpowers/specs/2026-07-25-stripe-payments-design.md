# Rhyze Stripe Payments Design

## Objective

Connect every new Rhyze payment flow to one Stripe account without trusting browser redirects as proof of payment. Cover standard-class credits, specialty-event tickets, recurring memberships, merchandise, saved payment methods, refunds, receipts, failed payments, and cancellations.

## Architecture

Stripe-hosted Checkout handles payment entry so card details never touch Rhyze servers. Stripe Billing owns recurring subscription charging. Stripe Customer Portal owns saved payment methods, invoice access, and subscription cancellation. Rhyze creates pending database records before checkout and provisions access only from signature-verified, idempotent webhooks.

## Payment flows

### Memberships, trial, and standard-class credits

The existing `Product` and `Purchase` records remain the source of the intended sale. A catalog synchronization command creates or reuses Stripe Products and Prices, then stores each active Rhyze `stripePriceId`. Checkout includes the Rhyze purchase, product, and user identifiers. The webhook marks the purchase paid and grants a membership or credit exactly once.

### Specialty events

An authenticated member selects an event occurrence. Rhyze creates a pending `CommerceOrder` linked to that occurrence and a Stripe Checkout Session for the server-authoritative event price. A successful webhook creates the booking only if capacity remains; otherwise it records the paid order for immediate admin resolution and refund rather than silently overselling.

### Merchandise

The server validates every cart item against the local catalog and records immutable item snapshots in `CommerceOrderItem`. Stripe Checkout receives server-calculated prices. The webhook marks the order paid. The success page verifies the session-backed order before displaying payment confirmation and clearing the cart.

## Subscription lifecycle

The webhook processes `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, and `charge.dispute.created`. Membership state mirrors Stripe. Paid renewal invoices extend access and create revenue records; failures mark the membership `PAST_DUE` and queue member/admin notifications; cancellation removes future access at the Stripe-provided period end.

## Financial ledger

`PaymentRecord` is the append-only native Stripe revenue ledger. It stores the Stripe event, customer, Checkout Session, PaymentIntent, Invoice, Subscription, amount, currency, payment status, payment type, and optional links to a Rhyze purchase or commerce order. Unique Stripe identifiers and the existing `StripeEvent` table prevent duplicate revenue and duplicate fulfillment.

## Customer billing

The member Billing page creates a short-lived Stripe Customer Portal session server-side and redirects the authenticated member. Members can update cards, download Stripe invoices, and manage eligible subscriptions without Rhyze storing payment details.

## Security and operational controls

- Never expose `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` to browser code.
- Verify webhook signatures against the unmodified request body.
- Use Stripe and database idempotency for checkout, provisioning, refunds, and renewals.
- Calculate all prices on the server; reject unknown products, sizes, quantities, events, inactive products, and unavailable dates.
- Start in Stripe sandbox mode. Promote to live keys only after checkout, renewal, decline, refund, cancellation, duplicate-webhook, and portal tests pass.
- Fail closed when configuration or Stripe catalog mapping is missing.

## Required account setup

The owner signs into Stripe privately and supplies sandbox/live credentials through `.env.local` for local work and encrypted hosting environment variables for production. Rhyze never requests those values in chat. The Stripe Dashboard webhook endpoint subscribes to the lifecycle events listed above, and Customer Portal settings enable payment-method updates, invoice history, and cancellation according to Rhyze policies.

## Verification

Automated tests cover catalog synchronization, server-side totals, webhook idempotency, purchase fulfillment, recurring renewals, failed payments, cancellations, refunds, event capacity, and portal authorization. Final checks run `npm run typecheck`, `npm test`, and `npm run build`, followed by Stripe sandbox checkout tests and webhook delivery verification.
