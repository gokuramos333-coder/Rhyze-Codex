# ADMIN Client Directory Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable source/type and membership filters plus clearer client-row presentation to the ADMIN Clients directory.

**Architecture:** Put Prisma-compatible filter construction in a focused ADMIN helper so its behavior can be unit tested independently. Keep product-option loading and presentation in the existing server-rendered page.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma, Tailwind CSS, Vitest

## Global Constraints

- Preserve the existing Rhyze styling and ADMIN layout.
- Filters must combine and persist through URL query parameters.
- Do not deploy to Netlify.

---

### Task 1: Client directory query contract

**Files:**
- Create: `lib/admin/client-directory-filters.ts`
- Test: `tests/unit/admin/client-directory-filters.test.ts`

**Interfaces:**
- Produces: `buildClientDirectoryWhere({ q, source, plan }): Prisma.UserWhereInput`

- [ ] Write failing tests for Somble, native, instructor, plan, no-plan, and combined filters.
- [ ] Run the focused test and confirm it fails because the helper does not exist.
- [ ] Implement the minimal typed query builder.
- [ ] Run the focused test and confirm it passes.

### Task 2: ADMIN Clients presentation

**Files:**
- Modify: `app/(studio)/admin/members/page.tsx`
- Modify: `components/admin/AdminStatusBadge.tsx`

**Interfaces:**
- Consumes: `buildClientDirectoryWhere`

- [ ] Load membership-plan options from products that have membership records.
- [ ] Add source/type and membership-plan selectors while preserving search and sort.
- [ ] Add visible row numbering.
- [ ] Show INSTRUCTOR with light-blue status styling.
- [ ] Show current membership plan names in orange and No native plan neutrally.

### Task 3: Verification

**Files:**
- No production-file changes expected.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Inspect `/admin/members` locally and do not deploy.
