# Somble Final Data and Account Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the complete, current Rhyze operating history and member access from Somble into the Rhyze #2 PostgreSQL platform without duplicate accounts, bookings, credits, subscriptions, or charges.

**Architecture:** Keep Somble read-only history separate from native Rhyze financial records while linking every imported row to a stable external identity and an auditable import batch. Run the importer first against local PostgreSQL, then against an isolated Netlify Database preview branch, and only run the final production import during a short Somble write freeze. Imported users claim their existing Rhyze account through a one-time secure link because Somble passwords and raw payment-card data must not be copied.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma 6, PostgreSQL, Netlify Database migrations, Stripe API, Resend, Vitest.

## Global Constraints

- Do not deploy or apply Netlify production migrations until Gui explicitly requests the deployment.
- Somble remains the operational source until final reconciliation passes.
- Never import raw passwords, password hashes, card numbers, CVC values, or bank credentials.
- Match people by normalized email first; name-only matches require a documented manual decision.
- Preserve Somble/Stripe identifiers and source-file hashes for idempotency and auditability.
- Never create a new Stripe subscription for a member whose current subscription is still active.
- Imported financial history remains labeled Somble history unless it is verified from the connected Stripe account.
- Every skipped or conflicting row must appear in a reconciliation report; the importer may not silently discard data.
- The final production import must be rerunnable without increasing counts or charging anyone.

## Current Verified Baseline — July 27, 2026

- Existing client export: 23 clients; newest login timestamp is July 24, 2026.
- Existing transaction export: 22 transfers totaling $935.00; newest transfer is July 23, 2026.
- Existing attendee exports: seven rosters totaling 21 named attendees/bookings.
- Local database: 35 users, 23 Somble profiles, 22 Somble transactions, 23 bookings, 21 Somble-import bookings, 76 class occurrences, 1 membership, 1 purchase, and 2 payment records.
- Current importer covers client directory rows, transferred-revenue rows, and named attendee rosters.
- Current importer does not yet provide a full cutover for active Somble memberships, remaining class credits, subscription billing state, refunds, invoices, waitlists, cancellation history, or account claiming.
- Somble data exported on July 24 is a rehearsal source only. A fresh full export is required immediately before cutover.

## Required Source Package

Create one immutable folder outside the repository at `~/Inbox/rhyze-somble-cutover-final/`, containing a `manifest.json` with the UTC export timestamp plus:

1. Full Somble client export.
2. Full Somble transaction/payment export through the freeze time.
3. Active membership/subscription list with plan, status, start, renewal/end date, member email, and Stripe customer/subscription IDs when Somble exposes them.
4. Class-pack and drop-in balance list with remaining credits and expiration dates.
5. Full future schedule and all recurring-series definitions.
6. One roster export for every upcoming occurrence and every historical occurrence Rhyze wants retained.
7. Waitlist, cancellation, late-cancel, no-show, and attendance exports when available.
8. Refund, dispute, failed-payment, invoice, and receipt exports when available.
9. Waiver acceptance export only when it contains verifiable version and acceptance timestamps.
10. Stripe read-only reconciliation export for customers, active subscriptions, invoices, payments, refunds, and disputes from the same Stripe account currently used by Somble.

Before importing, copy the entire package to encrypted backup storage and record SHA-256 hashes. Do not edit source CSVs in place; corrections live in a separate mapping file.

---

### Task 1: Add Import-Batch Auditability and Conflict Reporting

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260727234500_somble_cutover_tracking/migration.sql`
- Create: `netlify/database/migrations/20260727234500_somble_cutover_tracking.sql`
- Create: `lib/import/somble-cutover.ts`
- Test: `tests/unit/import/somble-cutover.test.ts`

**Interfaces:**
- Produces: `createSombleManifest(files: SourceFile[]): Promise<SombleManifest>`
- Produces: `externalKey(kind: SombleEntityKind, sourceId: string): string`
- Produces: `classifyIdentityMatch(input, existing): IdentityMatchResult`
- Produces: persisted `SombleImportBatch`, `SombleExternalLink`, and `SombleImportIssue` records.

- [ ] **Step 1: Write the failing manifest and identity tests**

```ts
it('produces the same manifest for the same immutable source files', async () => {
  const first = await createSombleManifest(files);
  const second = await createSombleManifest(files);
  expect(second.batchKey).toBe(first.batchKey);
});

it('blocks a name-only collision instead of overwriting a member', () => {
  expect(classifyIdentityMatch(incoming, sameNameDifferentEmail)).toEqual({
    kind: 'CONFLICT',
    reason: 'NAME_ONLY_MATCH',
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/import/somble-cutover.test.ts`

Expected: FAIL because the cutover manifest and identity classifier do not exist.

- [ ] **Step 3: Add the tracking models and migration**

```prisma
model SombleImportBatch {
  id             String   @id @default(cuid())
  batchKey       String   @unique
  exportedAt     DateTime
  sourceManifest Json
  mode           String
  status         String
  summary        Json?
  startedAt      DateTime @default(now())
  completedAt    DateTime?
  externalLinks  SombleExternalLink[]
  issues         SombleImportIssue[]
}

model SombleExternalLink {
  id            String @id @default(cuid())
  importBatchId String
  entityKind    String
  externalId    String
  localId       String
  checksum      String
  importBatch   SombleImportBatch @relation(fields: [importBatchId], references: [id], onDelete: Restrict)
  @@unique([entityKind, externalId])
  @@index([localId])
}

model SombleImportIssue {
  id            String @id @default(cuid())
  importBatchId String
  entityKind    String
  sourceRow     Int?
  severity      String
  code          String
  message       String
  sourceData    Json
  resolvedAt    DateTime?
  resolution    String?
  importBatch   SombleImportBatch @relation(fields: [importBatchId], references: [id], onDelete: Cascade)
  @@index([importBatchId, severity, code])
}
```

- [ ] **Step 4: Implement deterministic hashes, external links, and conflict results**

Normalize emails with `trim().toLowerCase()`. Never use a normalized name as a final identity key. Store the original source row in `sourceData` for audit review.

- [ ] **Step 5: Verify the focused tests and migrations**

Run: `npx vitest run tests/unit/import/somble-cutover.test.ts && npx prisma validate`

- [ ] **Step 6: Commit the audit foundation**

```bash
git add prisma/schema.prisma prisma/migrations/20260727234500_somble_cutover_tracking netlify/database/migrations/20260727234500_somble_cutover_tracking.sql lib/import/somble-cutover.ts tests/unit/import/somble-cutover.test.ts
git commit -m "feat: add auditable Somble cutover batches"
```

### Task 2: Expand Parsers for Memberships, Credits, Schedule, and Booking State

**Files:**
- Modify: `lib/import/somble.ts`
- Create: `lib/import/somble-memberships.ts`
- Create: `lib/import/somble-schedule-cutover.ts`
- Create: `lib/import/somble-payments.ts`
- Modify: `tests/unit/import/somble.test.ts`
- Create: `tests/unit/import/somble-memberships.test.ts`
- Create: `tests/unit/import/somble-schedule-cutover.test.ts`

**Interfaces:**
- Produces: `parseSombleMemberships(csv: string): SombleMembershipInput[]`
- Produces: `parseSombleCreditBalances(csv: string): SombleCreditBalanceInput[]`
- Produces: `parseSombleSchedule(csv: string): SombleOccurrenceInput[]`
- Produces: `parseSombleRoster(csv: string): SombleBookingInput[]`
- Produces: `parseSomblePaymentHistory(csv: string): SomblePaymentInput[]`

- [ ] **Step 1: Write table-driven failing tests for every supported status**

```ts
it.each([
  ['booked', 'CONFIRMED'],
  ['checked in', 'ATTENDED'],
  ['cancelled', 'CANCELLED'],
  ['late cancel', 'LATE_CANCELLED'],
  ['no show', 'NO_SHOW'],
])('maps Somble booking status %s to %s', (source, expected) => {
  expect(mapSombleBookingStatus(source)).toBe(expected);
});
```

Add literal fixtures for unlimited memberships, limited monthly plans, class packs, trials, paused/cancelled subscriptions, credit expiration, refunds, and waitlists.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run tests/unit/import/somble*.test.ts`

Expected: FAIL because the expanded parsers and status mappings do not exist.

- [ ] **Step 3: Implement strict parsers**

Each parser must validate required headers, normalize identity values, retain external IDs, use integer cents, parse timestamps with timezone, and reject duplicate IDs within the same file.

- [ ] **Step 4: Add an explicit mapping file for Somble offering names**

Create `config/somble-cutover-map.json` with entries shaped as:

```json
{
  "sombleOfferingId": "source-offering-id",
  "rhyzeProductSlug": "elevate",
  "rhyzeClassSlug": null,
  "kind": "MEMBERSHIP"
}
```

The importer must stop on an unmapped offering; it may not guess based on partial title matching.

- [ ] **Step 5: Verify parsing and malformed-row behavior**

Run: `npx vitest run tests/unit/import/somble*.test.ts`

- [ ] **Step 6: Commit the source adapters**

```bash
git add lib/import config/somble-cutover-map.json tests/unit/import
git commit -m "feat: parse complete Somble cutover exports"
```

### Task 3: Build One Idempotent Full-and-Delta Import Command

**Files:**
- Create: `scripts/import-somble-cutover.ts`
- Create: `scripts/reconcile-somble-cutover.ts`
- Modify: `package.json`
- Test: `tests/integration/somble-cutover-import.test.ts`

**Interfaces:**
- Produces: `npm run somble:cutover -- --source ~/Inbox/rhyze-somble-cutover-final --dry-run`
- Produces: `npm run somble:cutover -- --source ~/Inbox/rhyze-somble-cutover-final --apply`
- Produces: `npm run somble:reconcile -- --batch-file ~/Inbox/rhyze-somble-cutover-final/reports/summary.json --output ~/Inbox/rhyze-somble-cutover-final/reports`

- [ ] **Step 1: Write an integration test that imports the same batch twice**

```ts
it('is idempotent across full and repeated delta imports', async () => {
  await importBatch(fixture, database);
  const first = await snapshotCounts(database);
  await importBatch(fixture, database);
  expect(await snapshotCounts(database)).toEqual(first);
});
```

Add tests proving a later delta adds a new member/booking, updates a changed status, preserves native Rhyze data, and records conflicts without partial writes.

- [ ] **Step 2: Run the integration test and verify failure**

Run: `npx vitest run tests/integration/somble-cutover-import.test.ts`

- [ ] **Step 3: Implement ordered transactional import stages**

Order: users → profiles → products/classes → series/occurrences → memberships/credits → bookings/waitlists/attendance → payments/refunds/invoices → reconciliation summary. Apply each source file in its own database transaction and mark the overall batch failed if any fatal issue exists.

- [ ] **Step 4: Preserve native data and avoid duplicate balances**

Existing native bookings and ledger entries win. Imported credit opening balances use a single `ADJUSTMENT` entry whose external link prevents a second grant. Imported transactions remain `SombleTransaction` records until a Stripe object is verified.

- [ ] **Step 5: Produce machine-readable and owner-readable reports**

Write `summary.json`, `issues.csv`, `member-reconciliation.csv`, `booking-reconciliation.csv`, `membership-reconciliation.csv`, and `financial-reconciliation.csv`. Reports contain counts and discrepancies, not secrets or card data.

- [ ] **Step 6: Verify focused tests and dry-run the July 24 package**

Run:

```bash
npm run somble:cutover -- --source ~/Inbox/rhyze-somble-cutover-rehearsal --dry-run
npm run somble:reconcile -- --batch-file ~/Inbox/rhyze-somble-cutover-rehearsal/reports/summary.json --output ~/Inbox/rhyze-somble-cutover-rehearsal/reports
```

Expected baseline: 23 clients, 22 transferred-revenue rows totaling $935.00, and 21 named roster bookings. Any difference must appear in `issues.csv`.

- [ ] **Step 7: Commit the importer and reconciler**

```bash
git add scripts/import-somble-cutover.ts scripts/reconcile-somble-cutover.ts package.json tests/integration/somble-cutover-import.test.ts
git commit -m "feat: add full Somble cutover importer"
```

### Task 4: Reconcile Stripe Customers and Active Subscriptions Without Charging

**Files:**
- Create: `lib/import/somble-stripe-reconciliation.ts`
- Create: `scripts/reconcile-somble-stripe.ts`
- Test: `tests/unit/import/somble-stripe-reconciliation.test.ts`
- Test: `tests/integration/somble-stripe-reconciliation.test.ts`

**Interfaces:**
- Produces: `reconcileStripeCustomer(member, stripeCustomers): StripeIdentityDecision`
- Produces: `reconcileStripeSubscription(sourceMembership, stripeSubscription): SubscriptionDecision`
- Produces: `npm run somble:stripe-reconcile -- --batch-file ~/Inbox/rhyze-somble-cutover-final/reports/summary.json --dry-run`

- [ ] **Step 1: Write failing tests for exact Stripe identity rules**

Test exact customer ID, exact normalized email with one candidate, multiple-email-candidate conflict, active subscription match, cancelled subscription, and missing subscription.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run tests/unit/import/somble-stripe-reconciliation.test.ts tests/integration/somble-stripe-reconciliation.test.ts`

- [ ] **Step 3: Implement read-only Stripe reconciliation**

The command may read customers, subscriptions, invoices, payment intents, refunds, and disputes. It updates `User.stripeCustomerId` and `Membership.stripeSubscriptionId` only after a unique verified match. It must never call Stripe create, update, cancel, refund, or payment-confirmation APIs.

- [ ] **Step 4: Add duplicate-billing gates**

Block Rhyze subscription Checkout for an imported member while Stripe reconciliation status is `UNVERIFIED` or `CONFLICT`. A verified existing subscription becomes the source of future renewal webhooks; no replacement subscription is created.

- [ ] **Step 5: Verify reconciliation output**

Acceptance: every active Somble membership is either linked to exactly one active Stripe subscription or listed as a blocking issue. Acceptance also requires zero member-email pairs with more than one active equivalent subscription.

- [ ] **Step 6: Commit Stripe reconciliation**

```bash
git add lib/import/somble-stripe-reconciliation.ts scripts/reconcile-somble-stripe.ts tests/unit/import/somble-stripe-reconciliation.test.ts tests/integration/somble-stripe-reconciliation.test.ts
git commit -m "feat: reconcile Somble subscriptions with Stripe"
```

### Task 5: Add Secure Account Claiming for Imported Members

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260727235500_imported_account_claims/migration.sql`
- Create: `netlify/database/migrations/20260727235500_imported_account_claims.sql`
- Create: `lib/domain/accounts/account-claim-service.ts`
- Create: `app/(auth)/claim-account/page.tsx`
- Create: `app/(auth)/claim-account/actions.ts`
- Create: `scripts/send-somble-account-invites.ts`
- Modify: `lib/notifications/email-templates.ts`
- Test: `tests/unit/accounts/account-claim-service.test.ts`
- Test: `tests/integration/accounts/account-claim.test.ts`

**Interfaces:**
- Produces: `issueAccountClaim(userId: string): Promise<{ rawToken: string; expiresAt: Date }>`
- Produces: `claimImportedAccount(rawToken: string, password: string): Promise<void>`
- Produces: `npm run somble:send-claims -- --batch-file ~/Inbox/rhyze-somble-cutover-final/reports/summary.json --dry-run|--apply`

- [ ] **Step 1: Write failing claim-flow tests**

```ts
it('activates the existing invited user without creating a duplicate', async () => {
  const before = await db.user.count();
  await claimImportedAccount(token, 'SecurePass1!');
  expect(await db.user.count()).toBe(before);
  expect(await db.user.findUnique({ where: { email } })).toMatchObject({ status: 'ACTIVE' });
});
```

Also test expired, reused, unknown, and hashed-token cases.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run tests/unit/accounts/account-claim-service.test.ts tests/integration/accounts/account-claim.test.ts`

- [ ] **Step 3: Add hashed one-time claim tokens**

Tokens expire after 30 days, are stored only as SHA-256 hashes, become unusable after `usedAt`, and activate the existing `INVITED` user after setting a password that meets current validation rules.

- [ ] **Step 4: Require current Rhyze waiver acceptance when evidence is absent**

Do not fabricate Somble waiver acceptance. After a successful claim, redirect to `/member/waiver` when the active Rhyze waiver is unsigned, then continue to `/member`.

- [ ] **Step 5: Add the branded account-claim email and dry-run recipient report**

The invite explains that prior bookings, credits, and history are already attached to the email address. The dry run reports recipients, skipped owners/instructors, and missing-email conflicts without sending.

- [ ] **Step 6: Verify and commit the claim flow**

```bash
npx vitest run tests/unit/accounts/account-claim-service.test.ts tests/integration/accounts/account-claim.test.ts
git add prisma/schema.prisma prisma/migrations/20260727235500_imported_account_claims netlify/database/migrations/20260727235500_imported_account_claims.sql lib/domain/accounts/account-claim-service.ts 'app/(auth)/claim-account' scripts/send-somble-account-invites.ts lib/notifications/email-templates.ts tests/unit/accounts tests/integration/accounts
git commit -m "feat: let imported Somble members claim accounts"
```

### Task 6: Rehearse on Local PostgreSQL and an Isolated Netlify Database Branch

**Files:**
- Create: `docs/operations/somble-cutover-runbook.md`
- Create: `docs/operations/somble-cutover-reconciliation-checklist.md`
- Modify only files required by proven rehearsal failures.

**Interfaces:**
- Consumes: full importer, Stripe reconciler, and account-claim dry run.
- Produces: signed reconciliation reports and an exact production command log.

- [ ] **Step 1: Take a local database backup and apply migrations locally**

```bash
pg_dump "$DATABASE_URL" --format=custom --file ~/Inbox/rhyze-pre-cutover-local.dump
npx prisma migrate deploy
```

- [ ] **Step 2: Run the fresh full package locally twice**

First run imports the batch. Second run must leave all entity counts and money totals unchanged.

- [ ] **Step 3: Reconcile local results**

Require exact matches for: unique members; active memberships by plan/status; remaining credits by member/expiry; future occurrences; each roster name/count/status; payments/refunds by month/type; and Stripe active subscriptions.

- [ ] **Step 4: Create an isolated Netlify Database preview branch**

Use Netlify Database branching and migrations without changing `rhyzefitness.com`. Import only into that preview branch and keep email delivery disabled.

- [ ] **Step 5: Run browser acceptance on the preview URL**

Check owner client details, membership/credit balances, class rosters, member claim flow, member bookings, instructor-only rosters, reports, email archive, Stripe webhook idempotency, and access control.

- [ ] **Step 6: Resolve every blocking issue**

No production cutover while `SombleImportIssue` contains unresolved `FATAL` or `ERROR` rows, any active subscription is unverified, or any reconciliation total differs from the source package.

- [ ] **Step 7: Commit the runbook**

```bash
git add docs/operations/somble-cutover-runbook.md docs/operations/somble-cutover-reconciliation-checklist.md
git commit -m "docs: add Somble production cutover runbook"
```

### Task 7: Final Freeze, Production Import, and Switch

**Files:**
- No source changes unless a rehearsal found and tested a defect.
- Output: timestamped source package, database backup, command log, and reconciliation reports outside the repository.

- [ ] **Step 1: Announce and begin a 30–60 minute Somble write freeze**

Stop new Somble bookings, cancellations, member edits, schedule edits, refunds, and manual credit changes. Stripe continues processing; record the freeze timestamp in UTC.

- [ ] **Step 2: Export the final full/delta package**

Export all sources listed above after the freeze timestamp. Hash and back up the files before import.

- [ ] **Step 3: Back up production and run dry-run validation**

Stop if required files are missing, hashes changed, identity conflicts exist, totals do not reconcile, or active Stripe subscriptions are ambiguous.

- [ ] **Step 4: Apply production migrations and import once**

Run only after Gui explicitly authorizes deployment/cutover. Keep automated customer email delivery paused during the data import.

- [ ] **Step 5: Run production reconciliation before opening bookings**

Acceptance gates:

- Client total equals the final Somble export after documented duplicates/conflicts.
- Transactions, refunds, and revenue totals match by type and month.
- Every future occurrence matches date, time, instructor, price, capacity, status, and recurrence.
- Every named roster matches member email, booking status, and attendance state.
- Every active membership and remaining credit balance matches.
- Every active paid membership links to exactly one Stripe customer/subscription.
- No duplicate active subscription exists and no member was charged by the importer.
- All ADMIN, member, and instructor authorization checks pass.

- [ ] **Step 6: Send account-claim emails and enable Rhyze booking links**

Send claims only after data is reconciled. Switch public booking CTAs and, when ready, the `rhyzefitness.com` domain to Rhyze #2.

- [ ] **Step 7: Keep Somble read-only for 30–90 days**

Do not delete the Somble account during the reconciliation period. Use it only to resolve source-history questions; all new activity occurs in Rhyze.

- [ ] **Step 8: Verify the first live transactions**

For the first membership, class, event, and merchandise payment, verify Stripe payment → webhook → Rhyze purchase/order → credits/booking → receipt email → ADMIN report. Verify one refund end to end before declaring payment launch complete.

### Task 8: Final Automated Verification

**Files:**
- Modify only files required by verified failures.

- [ ] Run `npx prisma validate`.
- [ ] Run `npx prisma migrate status` against the target database.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npx vitest run tests/unit/launch/internal-links.test.ts`.
- [ ] Run the full Somble reconciliation command and require zero unresolved blocking issues.
- [ ] Verify Email Previews, Email Archive, member claim, Stripe Checkout test mode, webhook processing, membership credit booking, cancellation, waitlist promotion, roster attendance, and refund behavior in the browser.
- [ ] Record exact command output, source hashes, database backup location, reconciliation totals, and rollback owner in the cutover log.

## Rollback Rule

If import reconciliation fails before public links switch, restore the production backup and keep Somble live. If a defect appears after links switch, stop new Rhyze checkout/booking, preserve all post-switch Rhyze rows, export those new rows, restore or repair from the pre-cutover backup, replay verified post-switch rows idempotently, and reopen only after reconciliation passes. Never solve a rollback by deleting Stripe payments or subscriptions.
