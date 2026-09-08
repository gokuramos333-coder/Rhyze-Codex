# Automatic Event Cancellation Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically issue event-only credits for cancellations made more than six hours before an event, expire them exactly 30 days after cancellation, and display class and event balances separately.

**Architecture:** Keep the existing transactional cancellation workflow and idempotent credit ledger. Add pure domain helpers for event expiry and balance classification, then use them in cancellation and profile pages. Update the guarded Gracie correction utility to reconcile existing data safely.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma, PostgreSQL, Vitest.

## Global Constraints

- Event cancellations must use a six-hour eligibility cutoff.
- Event-only credits cannot book standard classes.
- Event-only credits expire exactly 30 days after the cancellation timestamp.
- Credit issuance must be automatic and idempotent.
- Do not deploy until the user explicitly requests deployment.

---

### Task 1: Event credit expiry and balance rules

**Files:**
- Modify: `lib/domain/bookings/cancellation-credit.ts`
- Create: `lib/domain/credits/credit-balances.ts`
- Modify: `tests/unit/bookings/booking-rules.test.ts`
- Create: `tests/unit/credits/credit-balances.test.ts`

**Interfaces:**
- Produces: `eventCancellationCreditTerms(cancelledAt: Date)` returning `{ validFrom, validUntil, quantity }`.
- Produces: `separatedAvailableCreditBalances(accounts)` returning `{ classCredits, eventCredits }`.

- [ ] Write failing tests for the six-hour event boundary, New York end-of-following-month expiry, and separate balances.
- [ ] Run the focused tests and confirm failures come from missing behavior.
- [ ] Implement the minimal pure helpers.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Automatic cancellation workflow

**Files:**
- Modify: `app/(portal)/member/bookings/actions.ts`
- Modify: `lib/policies.ts`
- Modify: `tests/unit/bookings/booking-rules.test.ts`
- Modify: `tests/unit/policies/policies.test.ts`

**Interfaces:**
- Consumes: `eventCancellationCreditTerms(cancelledAt)`.
- Produces: automatic event-credit creation using the existing `event-cancellation:<bookingId>` idempotency key.

- [ ] Write failing tests for the six-hour event cutoff and approved policy copy.
- [ ] Run the focused tests and confirm the old two-hour/14-day behavior fails.
- [ ] Use a 360-minute cutoff for events and the new event-credit terms for account creation and email copy.
- [ ] Update event policy language to match the implementation.
- [ ] Run focused tests and confirm they pass.

### Task 3: Separate member and admin credit balances

**Files:**
- Modify: `app/(portal)/member/page.tsx`
- Modify: `app/(portal)/member/membership/page.tsx`
- Modify: `app/(studio)/admin/members/[userId]/page.tsx`
- Create: `tests/unit/credits/credit-balance-surfaces.test.ts`

**Interfaces:**
- Consumes: `separatedAvailableCreditBalances(accounts)`.
- Produces: visible `Available class credits` and `Available event credits` metrics.

- [ ] Write a failing surface test for the two required labels and shared helper use.
- [ ] Run the test and confirm the current single balance fails.
- [ ] Replace combined balances with separate class/event totals on all three profile surfaces.
- [ ] Run the focused tests and confirm they pass.

### Task 4: Reconcile Gracie's event credit

**Files:**
- Modify: `scripts/correct-gracie-event-cancellation.ts`
- Create: `tests/unit/bookings/gracie-event-credit-correction.test.ts`

**Interfaces:**
- Consumes: the six-hour cutoff and `eventCancellationCreditTerms`.
- Produces: an idempotent `--apply` correction for `grace481@gmail.com`.

- [ ] Write a failing source/behavior test proving the script can reconcile an already-cancelled booking and update an existing credit account.
- [ ] Run the test and confirm the current confirmed-only/skip-existing behavior fails.
- [ ] Update the script to select the relevant confirmed or cancelled event booking, upsert the credit, and update the account expiration.
- [ ] Run a read-only database query to identify the exact target before applying.
- [ ] Run the guarded correction with `--apply` only after the target is verified.
- [ ] Query the database to verify Gracie has one available event credit and no duplicate return key.

### Task 5: Full verification

**Files:**
- No additional production files.

- [ ] Run focused tests for bookings, credits, policies, and surfaces.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Report the local preview routes and note that deployment has not occurred.
