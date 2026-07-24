# Somble ADMIN Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an owner-only Rhyze ADMIN dashboard backed by an idempotent import of the supplied Somble clients and transferred-revenue history.

**Architecture:** A shared owner authorization helper protects both ADMIN entry points and controls navigation visibility. Dedicated Prisma models retain Somble source fields without misrepresenting historical transfers as native Stripe purchases. Server-rendered ADMIN pages query native and imported records, while a focused client component supplies tabs, filters, and CSV downloads.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma 6, PostgreSQL, Vitest, Tailwind CSS.

## Global Constraints

- Only active OWNER accounts for Vanessa or Melissa may access ADMIN.
- Historical amounts are labeled Somble transferred revenue.
- Imports must be idempotent and preserve original external IDs.
- Imported clients receive INVITED accounts without fabricated passwords.
- Preserve Rhyze dark/coral/gold styling and existing management routes.

---

### Task 1: Owner-only authorization

**Files:**
- Create: `lib/auth/owner-access.ts`
- Modify: `lib/auth/session.ts`
- Modify: `app/(studio)/admin/layout.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `lib/site.ts`
- Modify: `components/layout/Header.tsx`
- Modify: `components/layout/MobileNav.tsx`
- Modify: `components/layout/SiteChrome.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/sitemap.ts`
- Test: `tests/unit/auth/owner-access.test.ts`

**Interfaces:**
- Produces: `isApprovedOwner(input: { email: string; role: Role; status: UserStatus }): boolean`
- Produces: `requireApprovedOwner(): Promise<ActiveUser>`

- [ ] Write tests proving only active Vanessa/Melissa OWNER accounts pass.
- [ ] Run `npx vitest run tests/unit/auth/owner-access.test.ts` and confirm failure because the helper is missing.
- [ ] Implement the helper, server requirement, conditional ADMIN navigation, sitemap removal, and dashboard redirect.
- [ ] Re-run the focused test and existing navigation tests.
- [ ] Commit the owner-access change.

### Task 2: Somble persistence and parser

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260724050000_add_somble_history/migration.sql`
- Create: `lib/import/somble.ts`
- Create: `tests/unit/import/somble.test.ts`

**Interfaces:**
- Produces: `parseSombleClients(csv: string): SombleClientInput[]`
- Produces: `parseSombleTransactions(csv: string): SombleTransactionInput[]`
- Produces: `summarizeSombleImport(clients, transactions): SombleImportSummary`

- [ ] Write parser tests for quoted CSV values, normalized emails/names, required columns, duplicate IDs, and the expected $935 reconciliation.
- [ ] Run the focused test and confirm failure because the parser is missing.
- [ ] Add `SombleClientProfile` and `SombleTransaction` models with unique external identifiers.
- [ ] Implement the minimal parser and summary functions.
- [ ] Generate Prisma Client and run the focused test.
- [ ] Commit persistence and parsing.

### Task 3: Idempotent import command

**Files:**
- Create: `scripts/import-somble.ts`
- Modify: `package.json`
- Test: `tests/unit/import/somble.test.ts`

**Interfaces:**
- Consumes: parser functions from Task 2.
- Produces: `npm run import:somble -- --clients <path> --transactions <path> --dry-run|--apply`

- [ ] Add tests for deterministic source keys and account matching rules.
- [ ] Confirm the new assertions fail.
- [ ] Implement dry-run reporting and transactional upserts for invited users, import profiles, and historical transactions.
- [ ] Run dry-run against both supplied exports and reconcile 23 clients, 22 transfers, and $935.
- [ ] Apply once, run again, and prove database counts do not increase.
- [ ] Commit the importer.

### Task 4: Branded ADMIN dashboard

**Files:**
- Modify: `components/app-shell/PortalShell.tsx`
- Modify: `app/(studio)/admin/layout.tsx`
- Modify: `app/(studio)/admin/page.tsx`
- Modify: `app/(studio)/admin/members/page.tsx`
- Modify: `app/(studio)/admin/payments/page.tsx`
- Create: `app/(studio)/admin/activity/page.tsx`
- Create: `app/(studio)/admin/messages/page.tsx`
- Create: `app/(studio)/admin/integrations/page.tsx`
- Create: `app/(studio)/admin/reviews/page.tsx`
- Create: `app/api/admin/somble-export/route.ts`
- Test: `tests/unit/admin/somble-metrics.test.ts`

**Interfaces:**
- Produces: real owner dashboard metrics and working destinations for every navigation item.

- [ ] Write tests for transferred-revenue totals and offering-type distributions.
- [ ] Confirm focused tests fail.
- [ ] Implement the branded overview, activity/upcoming/client panels, sales table, client search, offering summaries, and export endpoint.
- [ ] Add honest destination pages for messages, integrations, and reviews where external delivery is not connected.
- [ ] Run focused ADMIN tests and the internal-link audit.
- [ ] Commit the dashboard change.

### Task 5: Final reconciliation and verification

**Files:**
- Modify only files required by verification failures.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Stop the preview server, run `npm run build`, and restart port 3001.
- [ ] Verify `/admin`, `/admin/members`, `/admin/payments`, and `/dashboard` with approved and rejected accounts.
- [ ] Reconcile database values to 23 imported clients, 22 historical transfers, and $935 transferred revenue.
- [ ] Check all visible ADMIN navigation and dashboard controls in the browser.
- [ ] Commit any verification-only fixes and provide launch notes.
