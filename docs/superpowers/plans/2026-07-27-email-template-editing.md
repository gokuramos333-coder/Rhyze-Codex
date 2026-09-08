# Rhyze Email Template Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-logo email branding and owner-editable, saved, immediately approved template copy.

**Architecture:** Store a validated JSON copy override on each `EmailTemplateReview`. Merge it with catalog-generated dynamic content through one pure helper used by previews and every delivery path.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma/PostgreSQL, Resend, Vitest, Netlify.

## Global Constraints

- Keep automatic queued delivery paused until launch.
- Use `In Rhythm, We Rise.` exactly.
- Use the complete Building J address exactly.
- Do not expose CTA URLs to accidental Admin text editing.
- Existing templates are approved by the migration.

---

### Task 1: Override model and renderer

**Files:**
- Create: `lib/notifications/email-template-overrides.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260727193000_email_template_editing/migration.sql`
- Create: `netlify/database/migrations/20260727193000_email_template_editing.sql`
- Test: `tests/unit/notifications/email-template-overrides.test.ts`

- [ ] Write failing tests for placeholder interpolation and presentation merging.
- [ ] Run the focused test and confirm failure because the helper is absent.
- [ ] Implement validated override types and pure merge/interpolation functions.
- [ ] Add the nullable JSON override column and baseline approval migration.
- [ ] Run focused tests and Prisma validation.

### Task 2: Canonical email branding

**Files:**
- Modify: `lib/notifications/email-content.ts`
- Test: `tests/unit/notifications/email-templates.test.ts`

- [ ] Write failing assertions for the logo URL, exact tagline, and exact address.
- [ ] Confirm the branding assertions fail against the wordmark/old footer.
- [ ] Replace the wordmark with an accessible image and update HTML/plain text footer copy.
- [ ] Run the focused renderer tests.

### Task 3: Admin editor and delivery parity

**Files:**
- Modify: `app/(studio)/admin/email-previews/page.tsx`
- Modify: `app/(studio)/admin/email-previews/actions.ts`
- Modify: `app/api/jobs/email/route.ts`
- Modify: `app/api/contact/route.ts`
- Test: `tests/unit/notifications/email-preview-surfaces.test.ts`

- [ ] Write failing surface tests for the editor, save action, and delivery override usage.
- [ ] Confirm failures identify missing editing behavior.
- [ ] Add the owner-only edit form with sample placeholder guidance.
- [ ] Validate and save overrides while updating approval metadata.
- [ ] Apply saved overrides to preview, test, queue worker, and contact sends.
- [ ] Run notification tests and typecheck.

### Task 4: Release verification

**Files:**
- No additional source files.

- [ ] Generate and validate Prisma.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Deploy only `rhyze-fitness-rhyze-2` to Netlify.
- [ ] Confirm the live Admin preview URL remains authenticated and Website 1 is untouched.
