# Member Agreement and Policies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Available Credits and deliver one complete, versioned digital agreement with weather and business safeguards.

**Architecture:** A shared structured policy module renders both the public policies page and member agreement. Prisma keeps immutable agreement snapshots and acceptance evidence; booking continues to check the active version.

**Tech Stack:** Next.js 14, TypeScript, Prisma/PostgreSQL, Vitest.

## Global Constraints

- One required agreement checkbox gates booking.
- Media consent is optional and never gates booking.
- Material updates require re-signing.
- Existing acceptance evidence fields remain intact.
- Legal text is marked for New Jersey attorney review before production launch.

---

### Task 1: Shared policy source

**Files:**
- Create: `lib/policies.ts`
- Modify: `app/policies/page.tsx`
- Test: `tests/unit/policies/policies.test.ts`

**Interfaces:**
- Produces: `policySections`, `agreementSnapshot`, and `AGREEMENT_EFFECTIVE_LABEL`.

- [ ] Write failing tests for required sections, official cancellation-window language, weather restoration, travel-safety discretion, conduct, property, electronic records, and statutory-rights notice.
- [ ] Move existing policy copy into the shared module and add approved safeguards.
- [ ] Render the public page from the shared module.
- [ ] Run focused and legacy policy tests, then commit.

### Task 2: Versioned agreement acceptance

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260723_member_agreement_media_consent/migration.sql`
- Modify: `app/(portal)/member/actions.ts`
- Modify: `app/(portal)/member/waiver/page.tsx`
- Test: `tests/unit/waivers/waiver-acceptance.test.ts`

**Interfaces:**
- `WaiverAcceptance.mediaConsent: boolean`.
- Agreement acceptance continues to use `waiverVersionId` plus the authenticated user.

- [ ] Write a failing test proving agreement acceptance requires the agreement checkbox but not media consent.
- [ ] Add `mediaConsent` with a false default and persist its submitted value.
- [ ] Render every shared policy section, a required acceptance checkbox, optional media checkbox, and print control.
- [ ] Label the action `Accept and digitally sign`.
- [ ] Add a migration that publishes the complete current agreement as a new active waiver version.
- [ ] Run focused waiver and booking tests, then commit.

### Task 3: Dashboard copy

**Files:**
- Modify: `app/(portal)/member/page.tsx`
- Test: `tests/rhyze-new-platform.test.mjs`

- [ ] Add a failing regression assertion for `Available Credits`.
- [ ] Change only the visible label.
- [ ] Run the regression test and commit.

### Task 4: Verification

- [ ] Apply migrations to the local database with `npx prisma migrate dev`.
- [ ] Run `npm test -- --run`.
- [ ] Run `npm run test:legacy` if defined.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npx prisma validate`.
- [ ] Run `npm run build`.
- [ ] Verify `/policies`, `/member`, and `/member/waiver` in the browser.

