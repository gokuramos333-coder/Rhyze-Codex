# Mobile Reschedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make member class rescheduling readable, tappable, and overflow-free on mobile devices.

**Architecture:** Extract destination rendering into a focused server-rendered radio-card component. Preserve the existing form action and booking policy logic while the page supplies database results to the component.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Vitest, ReactDOM server rendering.

## Global Constraints

- Preserve the current Rhyze dark/coral/gold visual system.
- Keep existing reschedule fee and two-week eligibility behavior unchanged.
- Fix only verified mobile layout defects in the member portal.

---

### Task 1: Accessible mobile destination cards

**Files:**
- Create: `components/member/RescheduleClassPicker.tsx`
- Create: `tests/unit/member/reschedule-class-picker.test.tsx`
- Modify: `app/(portal)/member/bookings/reschedule/page.tsx`

**Interfaces:**
- Consumes: `memberBookingDateTimeLabel({ startAt, timezone })`.
- Produces: `RescheduleClassPicker({ destinations })`, where every destination has `id`, `startAt`, optional `timezone`, `capacity`, `historicalSignupCount`, `_count.bookings`, `template.name`, and optional `instructor.name`.

- [ ] **Step 1: Write the failing component test**

  Render two destinations to static markup and assert that each produces a required `destinationId` radio, a visible bordered card, class/date/instructor copy, and mobile-safe width classes.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `npx vitest run tests/unit/member/reschedule-class-picker.test.tsx`

  Expected: FAIL because `RescheduleClassPicker` does not exist.

- [ ] **Step 3: Implement the card picker**

  Render each destination as a label containing an `sr-only peer` radio and a full-width sibling card with `peer-checked` Rhyze selected styling. Render a clear empty-state paragraph when no destination is open.

- [ ] **Step 4: Integrate the picker and responsive page sizing**

  Replace the native select, use responsive heading/form padding, and keep the existing hidden booking ID plus confirmation action.

- [ ] **Step 5: Run focused tests and verify GREEN**

  Run: `npx vitest run tests/unit/member/reschedule-class-picker.test.tsx tests/unit/bookings/member-reschedule-surface.test.ts`

  Expected: PASS.

### Task 2: Mobile regression verification

**Files:**
- Modify only if a verified shared defect is found: `components/app-shell/PortalShell.tsx`

**Interfaces:**
- Consumes: authenticated member portal routes.
- Produces: no page whose document scroll width exceeds its mobile viewport.

- [ ] **Step 1: Inspect the reschedule page at phone width**

  Confirm `document.documentElement.scrollWidth <= window.innerWidth` and visually inspect the selected/unselected cards.

- [ ] **Step 2: Audit the remaining member pages**

  Check `/member`, `/member/profile`, `/member/bookings`, `/member/membership`, `/member/messages`, `/member/notifications`, and `/member/billing` at phone width.

- [ ] **Step 3: Run repository verification**

  Run: `npm run typecheck`, `npm test`, and `npm run build`.

  Expected: all commands exit successfully.
