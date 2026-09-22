# Admin Membership Changes Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task, with read-only independent review before handoff.

**Goal:** Allow approved admins to switch paid monthly plans without moving the renewal date or corrupting payments/credits.

**Architecture:** Durable quote/operation and Stripe-backed transitions; payment-proof webhook fulfillment; current entitlement reads from Membership rather than historical Purchase.

**Tech Stack:** Next.js server actions, React, Prisma/PostgreSQL, Stripe 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-admin-plan-changes-design.md`

## Global Constraints

- Preview only; no deployment, production writes, customer charges or real emails.
- Keep original renewal date; Stripe prorates the difference for the remaining period.
- Preserve purchases, existing bookings, role protections, failed-payment safeguards and styling.

## Task 1: Validation, quotes and durable operations

Files: `lib/domain/memberships/plan-change-policy.ts`, `lib/payments/admin-plan-change.ts`, `prisma/schema.prisma`, mirrored additive migrations, `tests/unit/memberships/plan-change-policy.test.ts`.

- [x] Write failing behavioral tests for same-plan rejection, monthly-only products, invalid dates, paid-period limits, exact existing-item replacement and unchanged billing anchor. Example: `expect(immediateChangeParams('si_old', 'price_new', 1800000000)).toEqual({items:[{id:'si_old',price:'price_new',quantity:1}],billing_cycle_anchor:'unchanged',proration_behavior:'always_invoice',payment_behavior:'pending_if_incomplete',proration_date:1800000000,expand:['latest_invoice']})`.
- [x] Run the targeted Vitest file and verify those expectations fail before adding implementation.
- [x] Implement pure validation/builders and durable quote/confirm services. Quote uses Stripe invoice preview; confirm claims operation under membership row lock, validates fresh Stripe ownership/status/price and uses persisted idempotency keys. Persist uncertainty without blindly replaying after Stripe's idempotency window.
- [x] Add additive MembershipPlanChange table and mirror SQL in Netlify migrations; generate Prisma client and run schema validation plus targeted tests.

## Task 2: Payment-confirmed access and history

Files: `lib/payments/membership-plan-change-webhook.ts`, `lib/payments/webhook-processor.ts`, `lib/domain/credits/current-credit-product.ts`, affected entitlement consumers, `tests/integration/membership-plan-changes.test.ts`.

- [x] Write PostgreSQL tests first: paid upgrade keeps period and grants only allowance difference; failed upgrade keeps old plan; downgrade does not reset usage; duplicate paid delivery grants once; next renewal gives new allowance; stale old invoice does not roll back; historical purchase product stays unchanged.
- [x] Run using explicitly guarded local disposable `membership_plan_test` database; confirm failures before implementation.
- [x] Implement transaction-scoped event handling before legacy processors for managed subscriptions, with verified customer/price/period, serialized operation/paid ordering and exact invoice financial records. Preserve existing processors for unmanaged subscriptions.
- [x] Prefer current linked membership product in booking/credit consumers; keep booking policy snapshots historical. Run existing VIP, booking, cancellation and payment regressions.

## Task 3: Admin controls and preview

Files: `components/admin/AdminMembershipChangeForm.tsx`, `app/(studio)/admin/members/[userId]/membership-change-actions.ts`, client detail page, UI tests.

- [x] Write UI tests for review-before-confirm, plan/date validation, inline errors, submitting state and unchanged renewal disclosure.
- [x] Implement approved-owner server actions and existing-style responsive form. Display scheduled/payment-pending state; no success label before durable confirmation.
- [x] Run UI tests and inspect synthetic local client in browser; no live Stripe actions.

## Task 4: Review and handoff

- [x] Run typecheck, lint, full tests with explicit local integration DBs and production build without live credentials.
- [x] Request read-only independent review and fix material findings with regression tests.
- [x] Record verification and remaining live-test boundary. Provide local review link and state not deployed.
