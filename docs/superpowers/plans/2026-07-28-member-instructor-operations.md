# Member and Instructor Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver connected member transaction controls, cancellation policy enforcement, instructor pay/referral tools, roster payment context, and the requested UI cleanup.

**Architecture:** Keep Stripe purchases, credit ledgers, memberships, referrals, and bookings as separate ledgers connected through existing IDs. Add only the fields needed for idempotent returned credits and instructor pay rates, then surface those records through existing server-rendered pages and guarded server actions.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma/PostgreSQL, Stripe, Vitest, Tailwind CSS.

## Global Constraints

- Preserve the Rhyze dark/coral/gold design.
- Instructor roster queries remain scoped to the signed-in instructor.
- Referral codes can be redeemed only once per user.
- Returned class credits expire exactly 14 days after return.
- Do not deploy this batch until the user explicitly asks.

---

### Task 1: Membership and message cleanup

**Files:** `components/sections/PricingTeaser.tsx`, `app/join/page.tsx`, member/admin message pages, UI tests.

- [ ] Write failing surface tests for removed copy and close message alignment.
- [ ] Run the tests and confirm the requested behavior is absent.
- [ ] Remove the redundant blocks and replace edge-pushed bubbles with modest indentation.
- [ ] Run the focused tests.

### Task 2: Cancellation policy and billing anchor

**Files:** membership change rules, member membership page/actions, confirmation component, tests.

- [ ] Write failing tests requiring a cancellation reason and calculating 14-day notice eligibility.
- [ ] Implement server validation and an accessible confirmation dialog with policy copy.
- [ ] Add a test proving monthly Checkout does not override Stripe’s signup-date billing anchor.
- [ ] Run focused membership and checkout tests.

### Task 3: Transaction controls and returned credits

**Files:** Prisma schema/migration, admin member detail/actions, payment service, tests.

- [ ] Write failing tests for an exact 14-day expiration and unique source reference.
- [ ] Add `sourceReturnKey` to credit ledger entries and migrate the database.
- [ ] Implement owner-only native refund and return-credit actions with audit logs.
- [ ] Replace spending summaries with expandable payment rows and action controls.
- [ ] Run focused payment/credit tests.

### Task 4: Instructor status, rates, and referral ranges

**Files:** Prisma schema/migration, instructor actions/pages, referral range helper, tests.

- [ ] Write failing tests for revoke/approve transitions and weekly/bi-weekly/monthly/custom ranges.
- [ ] Add optional standard and specialty pay rates to instructor profiles.
- [ ] Add owner controls, remove booked-value/waiver UI, and show one selected referral total plus its detailed rows.
- [ ] Run focused instructor/referral tests.

### Task 5: Roster payment context

**Files:** roster data helper, instructor/admin roster pages, Roster component, tests.

- [ ] Write failing tests for membership credit, intro trial, and Stripe event labels.
- [ ] Resolve each attendee’s current plan and booking payment source in the server query.
- [ ] Render plan and payment source beside every attendee.
- [ ] Run focused roster tests.

### Task 6: Drop-in referrals and client attribution

**Files:** referral service, member purchase UI/actions, client detail page, webhook tests.

- [ ] Write failing tests proving a drop-in is referral-eligible and earns $5 while membership earns $20.
- [ ] Enable the existing one-time referral checkout for the $25 drop-in.
- [ ] Show the applied instructor referral on the client profile.
- [ ] Run focused referral and payment tests.

### Task 7: Full verification

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and report remaining external-service risks without deploying.
