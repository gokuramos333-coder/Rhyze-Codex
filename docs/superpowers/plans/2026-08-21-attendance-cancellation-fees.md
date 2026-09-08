# Attendance Cancellation Fees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the approved cancellation, reschedule, late-cancel, no-show, and intro-trial consent rules with auditable Stripe payments and clear member confirmations.

**Architecture:** A pure policy module determines the member-visible and server-enforced outcome from plan type, event status, booking source, and exact time remaining. Server actions use a shared off-session fee service and persist typed PaymentRecords; client components only display the server-derived preview and collect confirmation.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma/PostgreSQL, Stripe, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-08-21-attendance-cancellation-fees-design.md`

## Global Constraints

- Do not deploy.
- Preserve specialty-event cancellation behavior.
- Never charge complimentary owner/staff bookings.
- Exactly 6 hours is a transfer-window cancellation; exactly 2 hours is a late cancellation.
- Server actions recompute all policy decisions and never trust client-provided amounts.
- Stripe writes use deterministic idempotency keys.
- Failed fee attempts are visible and auditable.

---

### Task 1: Policy decisions

**Files:**
- Create: `lib/domain/bookings/cancellation-policy.ts`
- Modify: `lib/domain/transfers/transfer-policy.ts`
- Test: `tests/unit/bookings/cancellation-policy.test.ts`
- Test: `tests/unit/transfers/transfer-policy.test.ts`

**Interfaces:**
- Produces: `cancellationPolicyDecision(input): CancellationPolicyDecision`
- Produces: `evaluateTransferWindow(classStart, requestedAt, accessType): TransferWindowDecision`

- [ ] Write literal boundary tests for standard, trial, VIP, event, and complimentary bookings.
- [ ] Run the tests and verify they fail because the new policy interface is absent.
- [ ] Implement the smallest pure policy functions that satisfy the matrix.
- [ ] Run the targeted tests and verify they pass.

### Task 2: Auditable fee persistence and consent schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260821123000_attendance_cancellation_fees/migration.sql`
- Test: `tests/unit/payments/attendance-fee-migration.test.ts`

**Interfaces:**
- Adds `LATE_CANCELLATION_FEE` and `NO_SHOW_FEE` to `PaymentRecordKind`.
- Adds `policyAcceptedAt DateTime?` and `policyAcceptance Json?` to `Purchase`.

- [ ] Write a migration behavior test that applies the expected schema contract.
- [ ] Run it and verify it fails before the migration exists.
- [ ] Add the Prisma fields and additive PostgreSQL migration.
- [ ] Generate Prisma Client and rerun the targeted test.

### Task 3: Shared saved-card fee service

**Files:**
- Create: `lib/payments/attendance-fee.ts`
- Test: `tests/unit/payments/attendance-fee.test.ts`

**Interfaces:**
- Produces: `chargeAttendanceFee(input, gateway): Promise<AttendanceFeeResult>`.
- Resolves the invoice default PaymentMethod, falling back to an attached card.
- Records `SUCCEEDED` or `FAILED` PaymentRecord rows with the correct kind.

- [ ] Write failing tests for default-card selection, attached-card fallback, exact PaymentIntent parameters, idempotency, success records, and failed records.
- [ ] Implement the gateway and Stripe adapter without exposing card data.
- [ ] Run the targeted tests and verify they pass.

### Task 4: Intro-trial policy acknowledgement

**Files:**
- Create: `lib/domain/memberships/trial-policy-consent.ts`
- Modify: `app/(portal)/member/membership/page.tsx`
- Modify: `app/(portal)/member/membership/actions.ts`
- Test: `tests/unit/memberships/trial-policy-consent.test.ts`
- Test: `tests/unit/bookings/intro-trial-eligibility-surface.test.ts`

**Interfaces:**
- Produces: `parseTrialPolicyConsent(value, acceptedAt)` returning an immutable snapshot.

- [ ] Write failing tests for missing consent and the exact recorded fee/coverage terms.
- [ ] Add the required intro-trial checkbox and accessible policy links.
- [ ] Reject checkout without consent and persist the timestamp/snapshot on Purchase.
- [ ] Run the targeted tests and verify they pass.

### Task 5: Member cancellation confirmation and enforcement

**Files:**
- Create: `components/member/CancelBookingButton.tsx`
- Modify: `app/(portal)/member/bookings/page.tsx`
- Modify: `app/(portal)/member/bookings/actions.ts`
- Test: `tests/unit/member/cancel-booking-button.test.tsx`
- Test: `tests/unit/bookings/booking-rules.test.ts`

**Interfaces:**
- The component receives a server-derived policy preview and opens an accessible confirmation dialog.
- `cancelBookingAction` recomputes the decision and charges only trial/VIP late-cancel fees.

- [ ] Write failing dialog tests for advance, transfer, standard late, trial late, and VIP late copy/actions.
- [ ] Implement the dialog with “Keep my class” as the safe default.
- [ ] Store booking access snapshots for new member bookings and waitlist promotions.
- [ ] Recompute policy on submit, update booking/credits, record fee outcome, and return an explicit result message.
- [ ] Run the targeted tests and verify they pass.

### Task 6: Transfer fees and charge safety

**Files:**
- Modify: `app/(portal)/member/bookings/reschedule/page.tsx`
- Modify: `app/(portal)/member/bookings/reschedule/actions.ts`
- Modify: `app/(portal)/instructor/classes/[occurrenceId]/transfers/actions.ts`
- Modify: `tests/unit/bookings/member-reschedule-surface.test.ts`

**Interfaces:**
- Standard transfer fee: 500 cents.
- Trial transfer fee: 0 cents.
- VIP transfer fee: 1,000 cents.

- [ ] Write failing tests for the three access types and exact member copy.
- [ ] Query the actual booking access type on both the page and action.
- [ ] Validate the destination before charging and refund if the final move fails.
- [ ] Persist the exact fee in BookingTransfer and PaymentRecord.
- [ ] Run the targeted tests and verify they pass.

### Task 7: VIP no-show fee and public policy consistency

**Files:**
- Modify: `lib/domain/bookings/booking-rules.ts`
- Modify: `app/(portal)/instructor/classes/[occurrenceId]/roster/actions.ts`
- Modify: `lib/policies.ts`
- Modify: `components/domain/accounts/SignUpForm.tsx`
- Test: `tests/unit/bookings/booking-rules.test.ts`
- Test: `tests/unit/bookings/no-show-fee-surface.test.ts`

**Interfaces:**
- Trial no-show: 1,000 cents.
- VIP no-show: 1,500 cents.
- Standard no-show: $10, matching intro-trial and VIP no-show fees.

- [ ] Write the failing VIP no-show test.
- [ ] Route no-show charging through the shared fee service and correct PaymentRecord kind.
- [ ] Update public/signup policy copy to the approved matrix.
- [ ] Run targeted tests and verify they pass.

### Task 8: Full verification

**Files:**
- Verify all modified files.

- [ ] Run `npx prisma generate`.
- [ ] Run `npm run typecheck`.
- [ ] Run targeted cancellation, transfer, trial, Stripe, and policy tests.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Verify the member cancellation dialogs and trial checkbox in the authenticated local browser.
- [ ] Report Found / Changed / Verified / Risk and explicitly state that nothing was deployed.
