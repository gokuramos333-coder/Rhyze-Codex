# Somble Schedule Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the website schedule and booking CTAs to the live Somble schedule for Rhyze Fitness.

**Architecture:** Centralize the Somble URLs in one small module. Replace stale schedule displays with Somble-powered UI while preserving the existing Rhyze class catalog.

**Tech Stack:** Next.js 14, React 18, TypeScript, Node test runner.

## Global Constraints

- Use `https://www.somble.com/vanessaramos/classes` as the live schedule URL.
- Do not use Somble credentials or private data.
- Do not refactor unrelated class, instructor, pricing, or layout code.
- Keep a direct external link fallback wherever the Somble iframe appears.

---

### Task 1: Centralize Somble URLs and prove UI uses them

**Files:**
- Create: `lib/somble.ts`
- Create: `tests/somble-schedule.test.mjs`
- Modify: `components/sections/ScheduleFull.tsx`
- Modify: `components/sections/SchedulePreview.tsx`
- Modify: `components/sections/ClassList.tsx`
- Modify: `app/classes/[slug]/page.tsx`

**Interfaces:**
- Produces: `sombleProfileUrl: string`, `sombleScheduleUrl: string`
- Consumes: React components import `sombleScheduleUrl` for iframe and booking CTAs.

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { sombleProfileUrl, sombleScheduleUrl } from '../lib/somble.ts';

test('Somble URLs point to the approved Rhyze Fitness profile and class schedule', () => {
  assert.equal(sombleProfileUrl, 'https://www.somble.com/vanessaramos');
  assert.equal(
    sombleScheduleUrl,
    'https://www.somble.com/vanessaramos/classes',
  );
});

test('schedule section embeds Somble with a direct fallback link', () => {
  const source = readFileSync(
    'components/sections/ScheduleFull.tsx',
    'utf8',
  );

  assert.match(source, /<iframe/);
  assert.match(source, /sombleScheduleUrl/);
  assert.match(source, /Open Somble Schedule/);
  assert.doesNotMatch(source, /slotsForDay/);
});

test('homepage preview no longer renders hard-coded schedule slots', () => {
  const source = readFileSync(
    'components/sections/SchedulePreview.tsx',
    'utf8',
  );

  assert.match(source, /sombleScheduleUrl/);
  assert.doesNotMatch(source, /slotsForDay/);
  assert.doesNotMatch(source, /statusLabel/);
});

test('class detail booking points to Somble instead of the placeholder booking route', () => {
  const source = readFileSync('app/classes/[slug]/page.tsx', 'utf8');

  assert.match(source, /sombleScheduleUrl/);
  assert.doesNotMatch(source, /@\\/lib\\/schedule/);
  assert.doesNotMatch(source, /`\\/book\\/\\$\\{c.slug\\}`/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --no-warnings --test tests/somble-schedule.test.mjs`
Expected: FAIL because `lib/somble.ts` does not exist yet.

- [ ] **Step 3: Add the centralized Somble URL module**

```ts
export const sombleProfileUrl = 'https://www.somble.com/vanessaramos';
export const sombleScheduleUrl = `${sombleProfileUrl}/classes`;
```

- [ ] **Step 4: Replace the Classes schedule with Somble embed and fallback**

Use `sombleScheduleUrl` for the iframe `src` and direct external link. Remove imports and rendering that depend on `lib/schedule`.

- [ ] **Step 5: Replace homepage preview fake slots with Somble CTA**

Use `sombleScheduleUrl` for the external CTA. Keep the existing “On the Floor” section look, but remove hard-coded day/slot grids.

- [ ] **Step 6: Point class detail booking to Somble**

Remove `schedule` import, `upcoming`, and hard-coded upcoming session list. Keep class educational content. Point “Book This Class” to `sombleScheduleUrl`.

- [ ] **Step 7: Point class-card booking to Somble**

Import `sombleScheduleUrl` in `components/sections/ClassList.tsx` and use it for each class card’s “Book” button, with `target="_blank"` and `rel="noreferrer"`.

- [ ] **Step 8: Run verification**

Run:

```bash
node --no-warnings --test tests/somble-schedule.test.mjs
node --no-warnings --test tests/instructors.test.mjs
npm run typecheck
npm run build
```

Expected: all commands exit 0.
