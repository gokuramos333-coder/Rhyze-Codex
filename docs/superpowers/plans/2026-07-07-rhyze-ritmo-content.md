# Rhyze Ritmo Content Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the displayed class to `Rhyze Ritmo` everywhere and install the approved description without changing its existing URL.

**Architecture:** The class catalog in `lib/classes.ts` owns the description and canonical display name. The schedule duplicates display labels in `lib/schedule.ts`, so all three matching entries must be updated while preserving `classSlug: 'ritmo-rhyze'`.

**Tech Stack:** Next.js 14, React 18, TypeScript

## Global Constraints

- Preserve the existing `ritmo-rhyze` slug and `/classes/ritmo-rhyze` URL.
- Do not change layout, styling, schedules, instructor assignments, or unrelated class content.

---

### Task 1: Update and verify Rhyze Ritmo content

**Files:**
- Modify: `lib/classes.ts:53-59`
- Modify: `lib/schedule.ts:38,52,58`

**Interfaces:**
- Consumes: Existing `ClassInfo` and `ScheduleEntry` data structures.
- Produces: Updated display copy consumed by the Classes page, schedule, and class detail route.

- [ ] **Step 1: Confirm the current content is present**

Run: `rg -n "Ritmo Rhyze|A love letter to the rhythms" lib/classes.ts lib/schedule.ts`

Expected: The old name appears in the class catalog and three schedule entries; the old description appears in the class catalog.

- [ ] **Step 2: Update the class catalog**

In `lib/classes.ts`, keep `slug: 'ritmo-rhyze'`, set `name: 'Rhyze Ritmo'`, and set the description exactly to:

```text
Get ready to move! Rhyze Ritmo blends high-energy Latin rhythms with easy-to-follow dance fitness choreography. It’s a full-body cardio party designed to let you lose yourself in the music, torch calories, and leave feeling completely empowered. No dance experience required—just bring your energy!
```

- [ ] **Step 3: Update schedule display labels**

In `lib/schedule.ts`, change all three matching `className` values from `'Ritmo Rhyze'` to `'Rhyze Ritmo'` and leave every `classSlug` unchanged.

- [ ] **Step 4: Verify source consistency**

Run: `rg -n "Ritmo Rhyze|Rhyze Ritmo|ritmo-rhyze" lib/classes.ts lib/schedule.ts`

Expected: `Rhyze Ritmo` appears four times, `ritmo-rhyze` appears four times, and `Ritmo Rhyze` has no standalone matches.

- [ ] **Step 5: Run the typecheck**

Run: `npm run typecheck`

Expected: Exit code 0 with no TypeScript errors.

- [ ] **Step 6: Verify in the browser**

Run the local site and inspect `/classes/` and `/classes/ritmo-rhyze/`.

Expected: Both pages show `Rhyze Ritmo`; the detail page shows the approved description; the URL remains `/classes/ritmo-rhyze/`.

- [ ] **Step 7: Commit the content change**

```bash
git add lib/classes.ts lib/schedule.ts docs/superpowers/plans/2026-07-07-rhyze-ritmo-content.md
git commit -m "content: rename Rhyze Ritmo class"
```
