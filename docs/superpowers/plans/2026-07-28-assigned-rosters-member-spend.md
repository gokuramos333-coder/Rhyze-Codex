# Assigned Rosters and Member Spend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make assigned classes open their attendee rosters and show accurate Admin-only yearly and lifetime member spending.

**Architecture:** Reuse the existing scoped roster routes. Add a pure reporting helper that calculates spend from already-loaded native purchases and Somble transfers, then render linked metrics on the owner-only member detail page.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma, Vitest.

## Global Constraints

- Do not add a database migration.
- Do not expose spending totals outside `/admin`.
- Native spending is net of refunds and excludes unpaid purchases.
- Current-year calculations use America/New_York calendar boundaries.

---

### Task 1: Direct roster navigation

**Files:**
- Modify: `app/(studio)/admin/instructors/[userId]/page.tsx`
- Modify: `app/(portal)/instructor/schedule/page.tsx`
- Test: `tests/unit/admin/assigned-roster-navigation.test.ts`

- [ ] Write a failing surface test requiring Admin assigned-class links to end in `/roster` and both views to show “View attendees”.
- [ ] Run `npm test -- --run tests/unit/admin/assigned-roster-navigation.test.ts` and confirm it fails for the Admin link and missing cue.
- [ ] Change the Admin instructor class destination to `/admin/schedule/${item.id}/roster` and add the attendee cue to both rows.
- [ ] Run the focused test and confirm it passes.

### Task 2: Member spending calculations

**Files:**
- Create: `lib/domain/reporting/member-spend.ts`
- Modify: `app/(studio)/admin/members/[userId]/page.tsx`
- Test: `tests/unit/admin/member-spend.test.ts`

- [ ] Write failing tests for native net spend, pending exclusion, current-year filtering, and Somble lifetime inclusion.
- [ ] Run `npm test -- --run tests/unit/admin/member-spend.test.ts` and confirm the missing helper failure.
- [ ] Implement `memberSpendTotals(input, now)` returning `yearlyCents` and `lifetimeCents` with New York year boundaries.
- [ ] Render linked “Spent this year” and “Lifetime spent” metrics on the Admin member detail page.
- [ ] Add `id="payment-history"` to the transaction section.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Verification

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Open an Admin instructor’s assigned class and verify the roster appears.
- [ ] Open Alexis Caslander and verify yearly and lifetime totals both show `$100.00` and link to Payment History.
