# Admin Clients, Memberships, Events, and Financial Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax so progress can be tracked.

**Goal:** Show only upcoming public events, add consistent active-membership reporting and filtering, give approved owners safe client-creation and membership-start tools, and make overview revenue/refund reporting current-month and range-aware without losing historical data.

**Architecture:** Put reusable eligibility, financial-series, client-creation, and membership-start rules in focused domain helpers. Keep pages responsible for querying and rendering, server actions responsible for owner authorization and redirects, Stripe Checkout responsible for paid card collection, and Prisma transactions responsible for no-charge assignments. Preserve current webhook fulfillment as the only paid-membership fulfillment path.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma/PostgreSQL, Stripe Checkout/webhooks, Resend queue, Tailwind, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-08-admin-client-membership-events-design.md`

## Global Constraints

- Do not delete, rewrite, or merge existing users, bookings, purchases, memberships, credits, Stripe identifiers, email history, waivers, or Somble history.
- Every admin mutation must call the existing approved-owner authorization boundary and revalidate all affected pages.
- Do not collect card data locally or auto-charge a saved card; paid memberships must use Stripe-hosted Checkout and existing webhook fulfillment.
- Admin-created users must activate their own account, set their own password, and accept the waiver themselves before booking.
- Implement each behavior with a failing test first, then the smallest production change that passes it.
- Do not deploy during this task.

## Task 1: Shared Active-Membership Definition

**Files:**

- Create: `lib/domain/memberships/active-membership.ts`
- Modify: `lib/admin/client-directory-filters.ts`
- Modify: `app/(studio)/admin/page.tsx`
- Modify: `app/(studio)/admin/members/page.tsx`
- Test: `tests/unit/memberships/active-membership.test.ts`
- Test: `tests/unit/admin/client-directory-filters.test.ts`

- [ ] Add failing tests proving that only `ACTIVE`/`TRIALING` memberships on `MONTHLY_UNLIMITED`, `LIMITED_MEMBERSHIP`, or `VIP` products qualify; intro trials, packs, drop-ins, paused, past-due, cancelled, expired, and local placeholder accounts do not.
- [ ] Add a shared Prisma membership predicate, user predicate, qualifying product-kind constant, and distinct-user counter helper.
- [ ] Extend the client directory filter input with `membership=active` and compose it with search/source/account/plan filters.
- [ ] Query distinct qualifying users for the overview card, rename it `Active memberships`, explain exclusions, and link it to `/admin/members?membership=active`.
- [ ] Keep the active filter in the directory form and display a visible active-filter summary while retaining the Current plan column.
- [ ] Run the focused tests until green.

## Task 2: Future-Only Event Query and Accessible Carousel

**Files:**

- Create: `lib/catalog/upcoming-events.ts`
- Create: `components/sections/EventsCarousel.tsx`
- Modify: `components/sections/EventsPreview.tsx`
- Test: `tests/unit/catalog/upcoming-events.test.ts`
- Test: `tests/unit/catalog/events-carousel.test.tsx`

- [ ] Add failing tests for the future-only Prisma occurrence filter and chronological card ordering.
- [ ] Add failing component tests for three desktop cards per page, one mobile-width card behavior through responsive CSS, previous/next boundary states, no controls for three or fewer cards, keyboard-operable labeled buttons, and empty state.
- [ ] Remove the fixed August/September query window and query only active, non-archived event templates with scheduled occurrences whose `startAt >= now`.
- [ ] Move the event-card rail into a client carousel that advances one viewport group, uses CSS scroll snapping and reduced-motion-safe scrolling, and preserves existing card/link visuals.
- [ ] Keep `/events` unlimited while the home presentation shows three cards per desktop viewport.
- [ ] Run the focused tests until green.

## Task 3: Dated Refund Accounting and Financial Series

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260908_add_commerce_refunds/migration.sql`
- Modify: `app/(studio)/admin/payments/actions.ts`
- Modify: `lib/admin/dashboard-analytics.ts`
- Test: `tests/unit/admin/dashboard-analytics.test.ts`
- Test: `tests/unit/admin/commerce-refund-surface.test.ts`

- [ ] Add failing tests for New York month boundaries, gross/refund/net range summaries, refund series grouped by actual refund date, and no double counting when the purchase occurred in an earlier month.
- [ ] Add a `CommerceRefund` model related to `CommerceOrder`, with amount, Stripe refund ID, reason, and `createdAt`, plus indexes and uniqueness needed for idempotency.
- [ ] Write a non-destructive migration that creates the table and backfills each existing refunded commerce order once using its current `updatedAt` timestamp and deterministic legacy ID.
- [ ] Update the commerce refund action to create the dated refund row in the same transaction as the order/payment updates.
- [ ] Extend financial helpers with typed refund records, range summaries, and daily refund/net series while keeping current revenue helpers compatible.
- [ ] Run Prisma generation/validation and the focused tests until green.

## Task 4: Monthly Overview Cards and Earnings Drill-Down

**Files:**

- Modify: `app/(studio)/admin/page.tsx`
- Modify: `components/admin/AnalyticsRangeControls.tsx`
- Modify: `components/admin/AnalyticsCharts.tsx`
- Test: `tests/unit/admin/admin-financial-overview.test.tsx`
- Test: `tests/unit/admin/analytics-range-controls.test.tsx`

- [ ] Add failing surface/component tests for `Revenue this month`, `Refunds this month`, current-month values, correct anchors, range-control query preservation, and both net-revenue/refund charts.
- [ ] Query all dated native purchase and commerce refunds needed for analytics, then calculate the cards with the current New York calendar-month range.
- [ ] Keep gross revenue dated to the payment/transfer date, subtract refunds on their actual refund date, and exclude zero-dollar admin assignments from revenue.
- [ ] Add `id="earnings"`, summary values for gross/refunds/net, a daily net-revenue chart, a daily refund chart, and selected-range refund details.
- [ ] Preserve `analytics=earnings` and `panel=sales` in Day/Week/Month/Year/custom links so card drill-down remains stable.
- [ ] Keep the existing lifetime Sales panel and payment ledger unchanged for historical reconciliation.
- [ ] Run the focused tests until green.

## Task 5: Admin Client-Creation Domain Flow

**Files:**

- Create: `lib/domain/accounts/admin-client-creation.ts`
- Create: `lib/domain/accounts/prisma-admin-client-repository.ts`
- Modify: `lib/notifications/email-templates.ts`
- Test: `tests/unit/accounts/admin-client-creation.test.ts`
- Test: `tests/unit/notifications/email-templates.test.ts`

- [ ] Add failing tests for normalized input, required identity fields, valid month/day, duplicate email refusal, `INVITED` member creation without a password or waiver, member profile/default notification preference, activation token, queued activation email, and audit entry.
- [ ] Implement a schema/parser for first name, last name, email, phone, birthday month/day, and optional product/action fields without accepting password or waiver fields.
- [ ] Implement the repository transaction that creates the invited member and related profile/defaults, rejects an existing email without mutation, and records `admin.client-created`.
- [ ] Issue an account-claim token through the existing account-claim service and queue a generic admin-created-account activation email with a unique activation URL.
- [ ] Run the focused tests until green.

## Task 6: Admin Paid Membership Checkout

**Files:**

- Create: `lib/domain/memberships/admin-membership-checkout.ts`
- Modify: `app/(studio)/admin/members/[userId]/actions.ts`
- Test: `tests/unit/memberships/admin-membership-checkout.test.ts`
- Test: `tests/unit/memberships/admin-membership-action.test.ts`

- [ ] Add failing tests for approved-owner authorization surfaces, eligible recurring-product validation, Stripe-price requirement, no-second-current-membership protection, client linkage, Stripe customer/email choice, subscription mode, metadata, success/cancel admin destinations, and failed-purchase cleanup.
- [ ] Build a focused checkout service that creates a pending purchase and Stripe Checkout session using the same customer/subscription builders as member checkout.
- [ ] Ensure the existing webhook remains solely responsible for marking the purchase paid and creating membership, credits, payment records, revenue, receipts, and confirmation emails.
- [ ] Add a server action that validates all browser inputs again and redirects management to Stripe or back to the client profile with a specific error.
- [ ] Run the focused tests until green.

## Task 7: No-Charge Membership Assignment

**Files:**

- Create: `lib/domain/memberships/admin-membership-assignment.ts`
- Modify: `lib/notifications/email-templates.ts`
- Modify: `app/(studio)/admin/members/[userId]/actions.ts`
- Test: `tests/unit/memberships/admin-membership-assignment.test.ts`
- Test: `tests/unit/notifications/email-templates.test.ts`

- [ ] Add failing tests for eligible product/status validation, future end date, required reason, per-client advisory locking, duplicate-current-membership refusal, zero-dollar paid purchase, active membership, purchase-backed credit account, finite grant ledger, unlimited plan, fixed end date, no Stripe ID, audit, email, and transaction rollback semantics.
- [ ] Implement the assignment transaction and credit creation using current product category/unlimited/included-credit fields.
- [ ] Store the reason and assignment dates in audit metadata and queue a purpose-specific no-charge membership email in the same transaction.
- [ ] Revalidate overview, directory, client profile, member home/membership/bookings, and schedule after success.
- [ ] Run the focused tests until green.

## Task 8: Admin Create-Client Page and Membership Panels

**Files:**

- Create: `app/(studio)/admin/members/new/page.tsx`
- Create: `app/(studio)/admin/members/new/actions.ts`
- Create: `components/admin/AdminMembershipStartForm.tsx`
- Modify: `app/(studio)/admin/members/page.tsx`
- Modify: `app/(studio)/admin/members/[userId]/page.tsx`
- Test: `tests/unit/admin/admin-create-client-surface.test.tsx`
- Test: `tests/unit/admin/admin-client-membership-surface.test.tsx`

- [ ] Add failing surface tests for the Create client button, identity fields, optional eligible membership selector, paid/no-charge visual separation, assignment end/reason inputs, status messages, and owner-only action imports.
- [ ] Add the Create client button beside Export clients and build the new page in the existing cream/black/coral/gold admin design.
- [ ] Wire new-client submission to create the account first, then either finish on the new profile, redirect to Stripe Checkout, or assign the selected plan without charge.
- [ ] Query only active qualifying recurring products for selectors; indicate when private/no-price plans are assignment-only.
- [ ] Add the reusable Start a membership panel to an existing client only when no qualifying active/trialing membership exists.
- [ ] Preserve current membership history, pause/resume/freeze/cancel controls, payments, credits, and booking history.
- [ ] Run the focused tests until green.

## Task 9: Full Verification and Local Review

**Files:**

- Modify only files required to fix failures directly caused by Tasks 1–8.

- [ ] Run `npm run prisma:validate` and `npm run prisma:generate`.
- [ ] Run every new/changed focused test and confirm green.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start the local app and verify responsive home event navigation, future-only content, overview monthly cards/charts, active-members client filter, Create Client flow validation, and no-membership client panel in the browser.
- [ ] Verify production was not deployed and the Netlify production URL remains on its prior deploy.
- [ ] Review `git diff --check`, `git status`, and the complete diff for unrelated or destructive changes.
