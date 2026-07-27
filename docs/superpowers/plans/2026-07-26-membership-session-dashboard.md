# Membership, Session, and Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show accurate membership/trial state, add member-requested and owner-controlled plan changes, preserve member sessions, and improve admin charts, sales sections, and status colors.

**Architecture:** Add a small membership-change-request workflow around existing `Membership` records. Member actions only create requests; owner actions call Stripe first when a subscription exists, then update Rhyze and audit the result. Reuse pure helpers for trial display and chart tooltip formatting, and keep existing pages/server queries as the source of live data.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma/PostgreSQL, Auth.js v5 JWT sessions, Stripe Node v19, React, Vitest, Tailwind CSS.

## Global Constraints

- Preserve the existing Rhyze dark/coral/gold visual language.
- Do not rewrite Somble history or unrelated dirty-worktree changes.
- Member plan changes remain pending until Vanessa or Melissa acts.
- Stripe must succeed before a Stripe-backed membership changes locally.
- Run `npm run typecheck`, `npm test`, and `npm run build` before completion.

---

### Task 1: Membership request data and trial display rules

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260726220000_membership_change_requests/migration.sql`
- Create: `lib/domain/memberships/membership-display.ts`
- Create: `tests/unit/memberships/membership-display.test.ts`

**Interfaces:**
- Produces: `introTrialDaysRemaining(input): number | null` and Prisma `MembershipChangeRequest` with `CHANGE`/`CANCEL` request types and `PENDING`/`APPROVED`/`DENIED` statuses.

- [ ] **Step 1: Write the failing trial-display tests**

```ts
expect(introTrialDaysRemaining({ activatedAt: null, currentPeriodEnd: null, now })).toBeNull();
expect(introTrialDaysRemaining({ activatedAt, currentPeriodEnd: end, now })).toBe(4);
expect(introTrialDaysRemaining({ activatedAt, currentPeriodEnd: end, now: afterEnd })).toBe(0);
```

- [ ] **Step 2: Run `npm test -- tests/unit/memberships/membership-display.test.ts` and verify failure because the helper is missing**
- [ ] **Step 3: Add the enums/model/migration and implement a ceiling-based, zero-clamped calendar-day helper**
- [ ] **Step 4: Run `npx prisma validate`, `npx prisma generate`, and the focused test**

### Task 2: Member plan display and owner-review request flow

**Files:**
- Modify: `app/(portal)/member/page.tsx`
- Modify: `app/(portal)/member/profile/page.tsx`
- Modify: `app/(portal)/member/membership/page.tsx`
- Modify: `app/(portal)/member/membership/actions.ts`
- Create: `lib/domain/memberships/change-request.ts`
- Create: `tests/unit/memberships/change-request.test.ts`

**Interfaces:**
- Consumes: `introTrialDaysRemaining` and Prisma request model.
- Produces: `parseMembershipChangeRequest(input)` and `requestMembershipChangeAction(formData)`.

- [ ] **Step 1: Write failing tests proving only `CHANGE`/`CANCEL` are accepted and member notes are bounded**
- [ ] **Step 2: Run the focused tests and verify the expected failure**
- [ ] **Step 3: Implement validation and a server action that verifies ownership, prevents duplicate pending requests, and writes an audit log**
- [ ] **Step 4: Show the current plan, status, dates, credits, trial countdown, pending request, and `Change or Cancel Plan` form on member surfaces**
- [ ] **Step 5: Run the membership-focused tests and typecheck**

### Task 3: Owner pause, unpause, cancellation approval, and denial

**Files:**
- Modify: `app/(studio)/admin/members/[userId]/page.tsx`
- Modify: `app/(studio)/admin/members/[userId]/actions.ts`
- Create: `lib/domain/memberships/admin-membership-action.ts`
- Create: `tests/unit/memberships/admin-membership-action.test.ts`

**Interfaces:**
- Produces: `stripeMembershipUpdateFor(action)` returning `{ pause_collection: { behavior: 'void' } }`, `{ pause_collection: '' }`, or `{ cancel_at_period_end: true }`.

- [ ] **Step 1: Write failing tests for pause, unpause, period-end cancel, and invalid transitions**
- [ ] **Step 2: Run the focused tests and verify failure**
- [ ] **Step 3: Implement owner-only actions that load the target membership/request, call `stripe.subscriptions.update` first when applicable, then update Prisma and write an audit log**
- [ ] **Step 4: Add Pause/Unpause controls and pending-request Approve/Deny controls to the admin member record with confirmation copy and success/error results**
- [ ] **Step 5: Run the focused tests and typecheck**

### Task 4: Booking eligibility and consistent statuses

**Files:**
- Modify: `app/(portal)/member/bookings/actions.ts`
- Modify: `components/admin/AdminStatusBadge.tsx`
- Create: `tests/unit/admin/status-badge.test.tsx`
- Modify: `tests/unit/bookings/booking-rules.test.ts`

**Interfaces:**
- Consumes: membership statuses and current credit accounts.
- Produces: consistent status classes for confirmed/attended, cancelled/late-cancelled/no-show, and paused.

- [ ] **Step 1: Write failing tests for the requested badge color families and paused-credit exclusion**
- [ ] **Step 2: Run focused tests and verify failure**
- [ ] **Step 3: Add status styles and constrain booking credit selection to credit accounts backed by eligible memberships or valid one-time purchases**
- [ ] **Step 4: Run focused tests and typecheck**

### Task 5: Interactive analytics and split event/merchandise sales

**Files:**
- Modify: `components/admin/AnalyticsCharts.tsx`
- Create: `lib/admin/chart-tooltip.ts`
- Modify: `app/(studio)/admin/payments/page.tsx`
- Create: `tests/unit/admin/chart-tooltip.test.ts`
- Create: `tests/unit/admin/payment-sections.test.ts`

**Interfaces:**
- Produces: `chartTooltip(label, value, format): string` and client-side hover/focus state for chart points and bars.

- [ ] **Step 1: Write failing tooltip-format tests and payment grouping tests with literal expected values**
- [ ] **Step 2: Run focused tests and verify failure**
- [ ] **Step 3: Make chart points/bars mouse- and keyboard-interactive with a visible label/value tooltip while retaining destination links**
- [ ] **Step 4: Split `commerceOrders` into `EVENT` and `MERCHANDISE`, render separate totals/tables, and keep refund actions in each section**
- [ ] **Step 5: Run the focused tests and typecheck**

### Task 6: Session persistence verification and final validation

**Files:**
- Modify: `lib/auth/session-config.ts`
- Modify: `auth.ts`
- Modify: `tests/unit/auth/session-config.test.ts`

**Interfaces:**
- Produces: explicit persistent JWT/cookie options derived from `AUTH_SESSION_MAX_AGE_SECONDS` without changing the session-token cookie name.

- [ ] **Step 1: Write a failing test for one-year JWT max age and persistent cookie properties (`httpOnly`, `sameSite: 'lax'`, `path: '/'`)**
- [ ] **Step 2: Run the focused test and verify failure**
- [ ] **Step 3: Export and apply the stable session cookie options, preserving secure cookies in production and non-secure localhost cookies in development**
- [ ] **Step 4: Run `npm run typecheck`, `npm test`, and `npm run build`**
- [ ] **Step 5: Restart the single preview server on port 3001 and verify `/`, `/member`, and `/admin` return the expected HTTP status/redirect behavior**
