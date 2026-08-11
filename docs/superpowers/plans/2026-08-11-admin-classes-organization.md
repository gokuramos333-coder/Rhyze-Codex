# Admin Classes Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organize Admin Classes into directly navigable sections, default its schedule to Daily, and keep Delete distinct from Archive without losing historical data.

**Architecture:** Extend the existing portal navigation item shape with optional child links and use fragment links for the four sections on the existing `/admin/classes` page. Parameterize the shared schedule-range resolver so Classes can default to Daily while Events keeps Monthly. Extract the protected-history decision into a pure domain helper and make the server action refuse deletion instead of mutating historical templates.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma, Vitest, Tailwind CSS.

## Global Constraints

- Preserve existing data, styling, Stripe, Resend, authentication, and business rules.
- Keep `/admin/classes` as one page with stable fragment identifiers.
- Delete must never silently archive a class.
- Classes default to Daily; Events keeps its existing default.
- Run typecheck, tests, and build; do not deploy.

---

### Task 1: Classes sidebar submenu

**Files:**
- Modify: `components/app-shell/PortalNavigation.tsx`
- Modify: `components/app-shell/PortalShell.tsx`
- Modify: `app/(studio)/admin/layout.tsx`
- Test: `tests/unit/admin/admin-navigation.test.ts`

**Interfaces:**
- Consumes: existing `NavItem` fields `href`, `label`, `matches`, and `badge`.
- Produces: optional `children: Array<{ href: string; label: string }>` on `PortalNavItem` and four Classes fragment destinations.

- [ ] **Step 1: Write the failing navigation test**

Add assertions that the admin layout contains:

```ts
children: [
  { href: '/admin/classes#slideshow-photos', label: 'Slideshow Photos' },
  { href: '/admin/classes#scheduled-classes', label: 'Scheduled Classes' },
  { href: '/admin/classes#create-a-class', label: 'Create a Class' },
  { href: '/admin/classes#edit-a-class', label: 'Edit a Class' },
]
```

Also assert that `PortalNavigation.tsx` renders `item.children` and a `<details>`/`<summary>` disclosure.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/unit/admin/admin-navigation.test.ts`

Expected: FAIL because nested Classes destinations and disclosure rendering do not exist.

- [ ] **Step 3: Implement the submenu**

Export a shared type from `PortalNavigation.tsx`:

```ts
export type PortalNavItem = {
  href: string;
  label: string;
  matches?: string[];
  badge?: number;
  children?: Array<{ href: string; label: string }>;
};
```

Render items with children as an expandable `<details>` group, preserving the current active, badge, focus, and responsive styles. Render existing items through the unchanged flat-link path. Import `PortalNavItem` into `PortalShell.tsx`, and add the four child links to the Classes navigation item in the admin layout.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test -- tests/unit/admin/admin-navigation.test.ts`

Expected: PASS.

### Task 2: Anchored Classes sections and headings

**Files:**
- Modify: `app/(studio)/admin/classes/page.tsx`
- Modify: `components/admin/ClassGalleryManager.tsx`
- Test: `tests/unit/admin/classes-admin-surface.test.ts`

**Interfaces:**
- Consumes: sidebar fragment destinations from Task 1.
- Produces: `slideshow-photos`, `scheduled-classes`, `create-a-class`, and `edit-a-class` section IDs.

- [ ] **Step 1: Write the failing section test**

Assert the Classes page/gallery source contains the four IDs and visible headings:

```ts
expect(gallerySource).toContain('id="slideshow-photos"');
expect(gallerySource).toContain('SLIDESHOW PHOTOS');
expect(source).toContain('id="scheduled-classes"');
expect(source).toContain('SCHEDULED CLASSES');
expect(source).toContain('id="create-a-class"');
expect(source).toContain('CREATE A CLASS');
expect(source).toContain('id="edit-a-class"');
expect(source).toContain('EDIT A CLASS');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/unit/admin/classes-admin-surface.test.ts`

Expected: FAIL because the anchors and two missing headings are absent.

- [ ] **Step 3: Add semantic sections**

Add `id` and `scroll-mt-8` to the gallery and scheduled sections. Wrap the creation form and template-card list in titled `<section>` elements using the existing font, border, white-card, and spacing language. Change the gallery display heading from `CLASS PHOTOS` to `SLIDESHOW PHOTOS` without changing gallery behavior.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test -- tests/unit/admin/classes-admin-surface.test.ts`

Expected: PASS.

### Task 3: Daily default for Admin Classes only

**Files:**
- Modify: `lib/admin/schedule-occurrence-range.ts`
- Modify: `app/(studio)/admin/classes/page.tsx`
- Create: `tests/unit/admin/schedule-occurrence-range.test.ts`

**Interfaces:**
- Consumes: `resolveScheduleOccurrenceRange(params, now?, defaultKey?)`.
- Produces: optional `defaultKey: ScheduleOccurrenceRangeKey = 'month'`; Classes passes `'day'`, Events passes nothing.

- [ ] **Step 1: Write the failing range tests**

Use a fixed midday New York timestamp and assert:

```ts
expect(resolveScheduleOccurrenceRange({}, now, 'day').key).toBe('day');
expect(resolveScheduleOccurrenceRange({}, now).key).toBe('month');
expect(resolveScheduleOccurrenceRange({ range: 'week' }, now, 'day').key).toBe('week');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/unit/admin/schedule-occurrence-range.test.ts`

Expected: TypeScript/runtime failure because the resolver does not accept a third argument and defaults to Month.

- [ ] **Step 3: Parameterize the resolver and opt Classes into Daily**

Add the optional third argument and replace the hard-coded fallback with `defaultKey`. Move the Classes page `now` initialization before range resolution and call:

```ts
resolveScheduleOccurrenceRange(searchParams, now, 'day');
```

Leave Events unchanged.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test -- tests/unit/admin/schedule-occurrence-range.test.ts tests/unit/admin/classes-admin-surface.test.ts tests/unit/admin/events-admin-surface.test.ts`

Expected: PASS.

### Task 4: Distinct safe Delete and Archive behavior

**Files:**
- Create: `lib/domain/classes/class-template-deletion.ts`
- Modify: `app/(studio)/admin/classes/actions.ts`
- Modify: `app/(studio)/admin/classes/page.tsx`
- Create: `tests/unit/classes/class-template-deletion.test.ts`
- Test: `tests/unit/admin/classes-admin-surface.test.ts`

**Interfaces:**
- Produces: `classTemplateHasProtectedHistory(occurrences): boolean` where each occurrence has `_count` values for `bookings`, `waitlistEntries`, `attendanceRecords`, `classMessages`, and `commerceOrders`.
- Consumes: the helper in `deleteClassTemplateAction` before any mutation.

- [ ] **Step 1: Write the failing domain tests**

Test that all-zero counts return `false`, and each protected count independently returns `true`. Add a source regression assertion that the Delete action no longer calls `classTemplate.update` in its protected-history branch and the page shows:

```text
This class has history and cannot be deleted. Archive it instead.
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/unit/classes/class-template-deletion.test.ts tests/unit/admin/classes-admin-surface.test.ts`

Expected: FAIL because the helper and safe refusal behavior do not exist.

- [ ] **Step 3: Implement the protected-history guard**

Create the pure helper, include all five protected relation counts in the Prisma query, and replace the current archive-on-delete update with an immediate redirect to `?error=history`. Keep the existing transaction that deletes empty occurrences, series, and the template, plus its audit log and revalidation. Update the error notice copy.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test -- tests/unit/classes/class-template-deletion.test.ts tests/unit/admin/classes-admin-surface.test.ts`

Expected: PASS.

### Task 5: Full verification

**Files:**
- Verify all files changed in Tasks 1–4.

**Interfaces:**
- Consumes: all completed task outputs.
- Produces: a verified, deployable working tree without deploying it.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- tests/unit/admin/admin-navigation.test.ts tests/unit/admin/classes-admin-surface.test.ts tests/unit/admin/events-admin-surface.test.ts tests/unit/admin/schedule-occurrence-range.test.ts tests/unit/classes/class-template-deletion.test.ts`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected: exit 0.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 5: Review the diff and deployment state**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only intended files from this task plus pre-existing user changes. Do not run any Netlify deploy command.
