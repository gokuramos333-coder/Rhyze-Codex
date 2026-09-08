# Stripe Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect all Rhyze payment flows to Stripe Checkout, Billing, webhooks, and Customer Portal with an auditable database ledger.

**Architecture:** Rhyze creates pending purchase/order records and Stripe-hosted Checkout Sessions; signature-verified idempotent webhooks are the only source of fulfillment. A native payment ledger unifies reporting for one-time payments and subscription renewals.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma, PostgreSQL, Stripe Node SDK, Vitest.

## Global Constraints

- Never expose Stripe secrets to client code or logs.
- Start in Stripe sandbox mode and fail closed without configuration.
- Use server-authoritative prices and Stripe-hosted payment collection.
- Provision products, bookings, and credits only from verified webhooks.
- Preserve existing Rhyze styling and current public routes.

---

### Task 1: Payment data model and configuration readiness

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260725200000_stripe_commerce_ledger/migration.sql`
- Modify: `lib/payments/stripe.ts`
- Modify: `.env.example`
- Test: `tests/unit/payments/stripe-config.test.ts`

**Interfaces:**
- Produces: `stripeConfiguration(): { checkout: boolean; webhooks: boolean; portal: boolean }`
- Produces: `CommerceOrder`, `CommerceOrderItem`, and `PaymentRecord` Prisma models.

- [ ] Write failing configuration and schema contract tests.
- [ ] Run the focused tests and confirm missing readiness/model failures.
- [ ] Add strict server-only configuration helpers and the Prisma ledger/order models.
- [ ] Apply the migration and regenerate Prisma.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Stripe catalog synchronization

**Files:**
- Create: `lib/payments/catalog-sync.ts`
- Create: `scripts/sync-stripe-catalog.ts`
- Modify: `package.json`
- Test: `tests/unit/payments/catalog-sync.test.ts`

**Interfaces:**
- Produces: `buildStripeCatalogEntry(product)` and `syncStripeCatalog(stripe, prisma)`.
- Stores the active Stripe Price ID on `Product.stripePriceId`.

- [ ] Write failing tests for one-time versus recurring price construction and inactive products.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Implement idempotent Product/Price creation using Rhyze product IDs as metadata and lookup keys.
- [ ] Add `npm run stripe:sync-catalog` and a dry-run mode.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Merchandise and event Checkout orders

**Files:**
- Modify: `app/api/checkout/route.ts`
- Create: `app/api/checkout/event/route.ts`
- Modify: `app/book/event/[slug]/page.tsx`
- Modify: `app/checkout/success/page.tsx`
- Create: `lib/payments/commerce-orders.ts`
- Test: `tests/unit/payments/commerce-orders.test.ts`
- Test: `tests/unit/payments/event-checkout.test.ts`

**Interfaces:**
- Produces: `priceMerchandiseCart(items)` and `priceEventOrder(occurrence)`.
- Checkout metadata includes `commerceOrderId` and `purchaseType`.

- [ ] Write failing tests for price tampering, invalid variants, quantity limits, event pricing, capacity, and immutable item snapshots.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Create pending orders before Stripe sessions and use server-derived totals.
- [ ] Route event booking into authenticated Stripe Checkout.
- [ ] Verify the success page only confirms a paid, session-matched order.
- [ ] Run the focused tests and confirm they pass.

### Task 4: Idempotent webhook lifecycle processor

**Files:**
- Create: `lib/payments/webhook-processor.ts`
- Modify: `app/api/stripe/webhook/route.ts`
- Modify: `lib/notifications/email-content.ts`
- Test: `tests/unit/payments/webhook-processor.test.ts`

**Interfaces:**
- Produces: `processStripeEvent(tx, event): Promise<void>`.
- Consumes pending `Purchase`/`CommerceOrder` records and creates `PaymentRecord` entries.

- [ ] Write failing tests for checkout success, duplicate events, async failure, renewal, failed invoice, cancellation, refund, dispute, event fulfillment, and capacity races.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Split signature verification from transactional event processing.
- [ ] Persist Stripe customer, subscription, invoice, and payment identifiers.
- [ ] Queue member/admin notifications for failures and disputes.
- [ ] Run the focused tests and confirm they pass.

### Task 5: Customer Portal and admin reconciliation

**Files:**
- Create: `app/(portal)/member/billing/actions.ts`
- Modify: `app/(portal)/member/billing/page.tsx`
- Modify: `app/(studio)/admin/payments/page.tsx`
- Modify: `app/(studio)/admin/integrations/page.tsx`
- Test: `tests/unit/payments/customer-portal.test.ts`
- Test: `tests/unit/payments/admin-ledger.test.ts`

**Interfaces:**
- Produces: authenticated `openStripePortalAction()`.
- Admin payments consumes `PaymentRecord` plus historical Somble data.

- [ ] Write failing portal authorization and ledger display tests.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Create Customer Portal sessions using the member Stripe customer ID.
- [ ] Display native Stripe revenue, status, source, and reconciliation links in Admin.
- [ ] Run the focused tests and confirm they pass.

### Task 6: Sandbox activation and release verification

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Create: `docs/launch/stripe-runbook.md`

**Interfaces:**
- Documents the exact sandbox-to-live sequence, webhook events, test cards, rollback, and reconciliation checks.

- [ ] Run `npm run stripe:sync-catalog -- --dry-run` without keys and verify a clear failure.
- [ ] Add sandbox credentials privately and run the real catalog sync.
- [ ] Configure the sandbox webhook and Customer Portal in Stripe Dashboard.
- [ ] Test successful, declined, 3DS, renewal, failed renewal, refund, cancellation, duplicate webhook, merchandise, event, and standard-class purchases.
- [ ] Run `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] Replace sandbox credentials with live credentials only after every sandbox check passes.
