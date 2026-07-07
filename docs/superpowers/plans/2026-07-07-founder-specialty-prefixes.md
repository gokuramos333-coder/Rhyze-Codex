# Founder Specialty Prefixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved RHYZE UP and RITMO labels before Vanessa Ramos's and Melissa Llanos's existing instructor specialties.

**Architecture:** Update the two instructor data records in `lib/instructors.ts`; the existing shared card will continue rendering each array with ` · ` separators. Add a focused data test to protect the exact order and copy.

**Tech Stack:** Next.js 14, TypeScript, Node.js test runner

## Global Constraints

- Vanessa's rendered specialty line must be `RHYZE UP · Dance · HIIT`.
- Melissa's rendered specialty line must be `RITMO · Latin Dance · Choreography`.
- Do not change the shared instructor-card layout or unrelated instructor data.

---

### Task 1: Add Founder Specialty Prefixes

**Files:**
- Modify: `tests/instructors.test.mjs`
- Modify: `lib/instructors.ts`

**Interfaces:**
- Consumes: `Instructor.specialties: string[]` and `InstructorCard` joining entries with ` · `.
- Produces: Exact ordered specialty arrays for the Vanessa Ramos and Melissa Llanos records.

- [ ] **Step 1: Write the failing test**

Add this test to `tests/instructors.test.mjs`:

```js
test('founder specialties include approved branded prefixes', () => {
  const bySlug = Object.fromEntries(instructors.map((instructor) => [instructor.slug, instructor]));

  assert.deepEqual(bySlug['vanessa-ramos'].specialties, ['RHYZE UP', 'Dance', 'HIIT']);
  assert.deepEqual(bySlug['melissa-llanos'].specialties, [
    'RITMO',
    'Latin Dance',
    'Choreography',
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --no-warnings --test tests/instructors.test.mjs`

Expected: FAIL because the current Vanessa and Melissa arrays do not contain the branded prefixes.

- [ ] **Step 3: Implement the minimal data change**

Change only these entries in `lib/instructors.ts`:

```ts
specialties: ['RHYZE UP', 'Dance', 'HIIT'],
```

```ts
specialties: ['RITMO', 'Latin Dance', 'Choreography'],
```

- [ ] **Step 4: Verify tests, types, build, and rendered output**

Run:

```bash
node --no-warnings --test tests/instructors.test.mjs
npm run typecheck
npm run build
```

Expected: all five instructor tests pass; type checking and production build exit successfully. In `/instructors/`, confirm the two rendered lines exactly match the Global Constraints.

- [ ] **Step 5: Commit and deploy**

```bash
git add docs/superpowers/plans/2026-07-07-founder-specialty-prefixes.md tests/instructors.test.mjs lib/instructors.ts
git commit -m "content: add founder specialty prefixes"
git push origin main
```

Expected: Netlify publishes the new `main` commit and the production instructors page shows both exact specialty lines.
