# Bounded refund approval implementation — local; synthetic preview published

## Controlled-switch local follow-up (2026-11-12 America/New_York)

The sole-writer follow-up implemented recurring **renewal invoice** refunds,
shared payment/entitlement ledger locks, human stale/legacy-case adjudication,
permanent UNKNOWN investigation, keyset queue/backlog, exact verified dual-owner
configuration, durable joint tasks and 24-hour escalation. It also added the
actual instructor-transfer/member-cancellation lock races and verified-receipt
refund notifications. Source/evidence details are in
`../evidence/controlled-switch-implementation.md` (relative to this checkout).

This changes the real owner UI beyond the previously approved hosted synthetic
preview. No preview publication, deployment, migration on an existing database,
provider/customer mutation or commit occurred in this follow-up. Publication is
held in both supported entrypoints until a verified old-runtime ingress/drain
mechanism exists. Original subscription-purchase refund/service semantics,
missing-identity UNKNOWN collection resolution, native cross-ledger execution,
verified responder configuration, full guarded release and updated UI review
remain open. The earlier limitation list below records the prior pass and is
superseded only where the controlled-switch report provides new evidence.

## Final supervisor result (supersedes worker-only execution status below)

Owner preview: https://rhyze-refunds-da327c.netlify.app

Immutable artifact: https://6af6769006022bb6365eb4f5--rhyze-refunds-da327c.netlify.app

- All four bounded corrections independently reviewed: `../evidence/final-independent-review.json` has `passed: true`, four resolved findings, no new blockers and `preview_safe: true`. The reviewer independently reran typecheck and targeted lint and compared an in-memory preview rebuild. Production readiness is explicitly NOT certified.
- Native PostgreSQL: **22 passed, zero skipped** after source restoration, including actual roster/member-reschedule actions, both service/refund lock winners with observed lock waiters, stale correction rejection and refunded collection reuse. `../evidence/four-findings-native-restored-green.log`. Owned socket-only disposable cluster stopped afterward.
- Native RED characterization: **six expected failures** against archived pre-fix refund/collection core with FINAL action/test/migration wiring (not a whole-tree baseline), then byte-exact restoration. `../evidence/four-findings-native-red-supervisor.log`, `../evidence/native-red-restoration.json`. Its 16 filtered-out tests are not a green release receipt. Earlier native supervisor run exposed one incorrect redirect assertion; the retained failed receipt is `../evidence/four-findings-native-supervisor.log`; the corrected test expects the existing attendance-fee-review redirect.
- Focused suite remains **145 passed**; typecheck, lint, diff check and identical migration mirrors passed. No full release suite or clean dependency installation is claimed.
- Local rebuilt browser verification passed at 390/768/1440 pixels. Hosted browser verification also passed those widths without overflow and exercised simulated refund, duplicate refund, pending reconciliation, replacement and duplicate replacement. Interactions were exercised at 1440 after the width loop, not separately at every width. Only three same-origin static GETs occurred; no errors, API, form submission or financial calls. `../evidence/hosted-browser-verification.json` and `hosted-preview-*.png`.
- Published ONLY index.html, preview.js, preview.css and _headers to a NEW isolated static site with no repository or custom domain. Canonical and immutable HTML/JS/CSS read back HTTP 200 and byte-exact hashes with restrictive CSP. `../static-preview-deployment.json`. Production published deploy stayed `6af64c9412c4baaf011a55bf`, commit `48460727d4e17484c4826b08e6087d4c18e32283`, locked/ready before and after. No production deployment, refund, charge or customer mutation.
- Reviewed implementation source is pinned in `../evidence/final-review-source-manifest.json`; only this documentation status addendum changed afterward. Kat's previously authorized $10 replacement was NOT executed and its authorization was not re-requested.

**Remaining gates:** actual instructor-transfer/member-cancellation race coverage; recurring-subscription refund workflow; legacy UNKNOWN/stale-case adjudication; complete cross-ledger certification; queue pagination/backlog monitoring; clean install/full guarded release checks; reviewed existing-database migration/runtime rollout; approved old-writer retirement/drain; assigned urgent responders and escalation; exact owner release approval. This preview demonstrates the bounded owner interface, not universal all-refund coverage or production financial readiness.

## Historical worker-only report

The following records the sandboxed implementation pass. Its native/browser BLOCKED and no-publication statements are historical and superseded by the supervisor evidence above; its coverage/operational exclusions remain in force.

Updated 2026-11-12 (America/New_York). Sole source writer. Inspected the prior worker's partial edits and all FOUR findings in `../../../evidence/independent-review.json`. This report supersedes the earlier verification counts and line references. The independent review itself was preserved; this pass is a self-review, not a new independent certification.

No production network, deployment, provider calls, customer mutation, live-data access, publication or commits. Existing unrelated edits were preserved. The publication/build script was not altered; the existing preview build was executed. Preview identities are fictional.

## Found / changed

1. **Exact case identity:** `components/admin/refund-review-queue.tsx:108` renders customer name/email/member ID, booking ID, class/start UTC, local payment ID, provider intent ID, original/refunded/remaining amounts and an HTTPS receipt link when recorded. Missing metadata is explicit. The authenticated real page loads related identity at `app/(studio)/admin/payments/refund-reviews/page.tsx:52`; both refund and replacement cards receive it. Exact selected-review payments are loaded separately from the 500 replacement candidates, so candidates no longer crowd those payments out. `preview/refund-review/main.tsx` uses this same component with example.test identities and no external receipt links.
2. **Current correction basis:** `lib/payments/refund-review.ts:69` captures booking identity, occurrence, status/version/policy, attendance identity/status/version and collection service ownership. Review creation persists the basis and its purpose. `app/(portal)/instructor/classes/[occurrenceId]/roster/actions.ts:179` creates correction reviews AFTER the attendance/booking writes in the same transaction. Approval checks this basis before reserving (`lib/payments/refund-review.ts:238`) and again under financial ownership immediately before submission (`:312`). The real adapter includes the same current snapshot in refund proof (`lib/payments/refund-review-stripe.ts:101`). Changed or missing basis fails closed; stale reviews are not silently refreshed. A change after reservation leaves permanent UNKNOWN ownership and no submission.
3. **Service/refund ownership:** `lib/payments/refund-review.ts:478` acquires the same booking/payment ownership before confirming service, requires an unrefunded successful exact receipt and rejects ANY approved refund operation, including UNKNOWN/FAILED. Missing successful collection also fails. Throws roll back service, transfer and transactional email writes. Existing roster/cancellation booking locks remain; member and instructor transfer now acquire booking ownership before service writes and reject stale booking versions (`app/(portal)/member/bookings/reschedule/actions.ts:128`, `app/(portal)/instructor/classes/[occurrenceId]/transfers/actions.ts:153`). The instructor blocked-transfer branch also takes booking ownership. Failed-service approval rejects confirmed collections and completed transfers owning the exact fee (`lib/payments/refund-review.ts:114`). Opening an unconfirmed-service review locks before reading (`app/(studio)/admin/payments/refund-reviews/actions.ts:48`). Service can win before approval, making that review stale; refund reservation can win, making service fail.
4. **Refunded collection reuse:** `lib/payments/attendance-fee.ts:239` revalidates the current receipt and approved refund ownership under the booking lock before returning a prior SUCCEEDED collection. Full/partial refund, missing receipt, wrong booking, non-success and refund ownership fail closed. Collection history remains intact; no automatic replacement or retry is introduced.

The still-unapplied additive migration now includes nullable `FinancialReview.basis`. Missing historical basis is deliberately blocked. PostgreSQL/Netlify migration mirrors are byte-identical; no migration was run against an existing database. SQL-only tables still require the migration in addition to Prisma schema setup.

## Verification actually run in this pass

| Check | Actual result / evidence (relative to source) |
| --- | --- |
| TDD reproduction before fixes | **11 failed / 13 passed**, `../evidence/four-findings-red.log`: missing card identity, unchanged refund evidence, stale correction/service approval, no service lock, refunded receipt/service reuse. |
| Same three regression files after fixes | **24 passed**, `../evidence/four-findings-green.log`. Four further tests cover post-reservation changes, fresh confirmed/completed service and missing basis; final ownership file has 13 passing tests. |
| Final focused suite | **15 files / 145 tests passed**, exit 0, `../evidence/four-findings-focused.log`. |
| TypeScript | `node_modules/.bin/tsc --noEmit`, exit 0, `../evidence/four-findings-typecheck.log`. |
| Targeted ESLint | Exit 0, `../evidence/four-findings-lint.log`; exact file arguments below. |
| Synthetic build | `node scripts/build-refund-preview.mjs`, exit 0, `../evidence/four-findings-build-preview.log`. Existing dependency scan excludes server/payment/auth imports. |
| Static public artifact checks | Exact four-file allowlist, fictional identity strings, CSP connect/form denial, no provider-shaped IDs passed; `../evidence/four-findings-preview-scan.log`. Updated hashes: `../evidence/public-allowlist.json`. |
| Diff / migration mirrors | `git diff --check` and byte comparison passed. |
| Native PostgreSQL | **BLOCKED**, `node scripts/test-refund-review.mjs` fails during initdb: `shmget … Operation not permitted`; `../evidence/four-findings-native.log`. No server, fixture writes or actual lock waiters ran. |
| Browser | **BLOCKED**, `node scripts/verify-refund-preview.mjs` fails at Chromium launch, permission denied; `../evidence/four-findings-browser.log`. Current layouts, identity visibility and browser CSP/network enforcement are not certified. Earlier screenshots are not evidence for this rebuilt artifact. |

Unit tests use database/provider doubles; they do not certify PostgreSQL locking. Native regressions were authored and typechecked, **not executed** and are not native RED/GREEN proof. In `tests/integration/refund-review.test.ts:576`, the actual authenticated-action functions, collection admission, booking writes, confirmation, and local queued-email writes run against the owned PostgreSQL database. Authentication/navigation are doubled; provider methods are synthetic and the provider boundary throws on accidental real access. Cases include:

- actual roster and member-reschedule service versus failed-service approval, **both service-first and refund-first** lock winners; gates require an observed `pg_stat_activity` lock waiter;
- actual roster and member-reschedule rejection of a refunded SUCCEEDED collection;
- actual roster correction captures the resulting CHECKED_IN basis, and a later clear makes its approval stale;
- the retained native approval/reconciliation, immutable authorization, duplicate-owner, commit-loss, webhook-first and transactional rollback cases. The old primitive correction-first expectation now requires stale approval rejection.

**Still missing native certification:** all newly authored cases until supervisor execution; actual instructor-transfer and member-cancellation race winners; wider cross-surface purchase/commerce races; process/deployment drain behavior. No full test suite, full application build, clean dependency install or production release check was run in this pass. Earlier copied dependencies remain a clean-install release limitation. No provider API behavior was verified live.

Exact focused command:

```sh
node_modules/.bin/vitest run tests/unit/payments/refund-review-ownership.test.ts tests/unit/payments/refund-review.test.ts tests/unit/payments/refund-review-stripe.test.ts tests/unit/payments/attendance-fee.test.ts tests/unit/payments/commerce-refunds.test.ts tests/unit/payments/stripe-payment-sync.test.ts tests/unit/payments/webhook-processor.test.ts tests/unit/admin/commerce-refund-action-safety.test.ts tests/unit/admin/attendance-timestamp-action.test.ts tests/unit/admin/refund-review-queue.test.tsx tests/unit/admin/attendance-credit-restore-action.test.ts tests/unit/bookings/member-reschedule-surface.test.ts tests/unit/launch/refund-database-guard.test.ts tests/unit/launch/kelly-test-environment.test.ts tests/unit/launch/admin-test-environment.test.ts
```

Exact lint command:

```sh
node_modules/.bin/eslint lib/payments/refund-review.ts lib/payments/refund-review-stripe.ts lib/payments/attendance-fee.ts components/admin/refund-review-queue.tsx 'app/(studio)/admin/payments/refund-reviews/page.tsx' 'app/(studio)/admin/payments/refund-reviews/actions.ts' 'app/(portal)/instructor/classes/[occurrenceId]/roster/actions.ts' 'app/(portal)/instructor/classes/[occurrenceId]/transfers/actions.ts' 'app/(portal)/member/bookings/reschedule/actions.ts' preview/refund-review/main.tsx tests/integration/refund-review.test.ts tests/unit/payments/refund-review-ownership.test.ts tests/unit/payments/refund-review-stripe.test.ts tests/unit/admin/refund-review-queue.test.tsx
```

All three final verification commands are also recorded in `../evidence/four-findings-verification-commands.json`.

## Coverage and operational limitations

- **Recurring subscriptions:** recurring Stripe subscription purchase refunds/cancellation remain blocked by the adapter pending a separately reviewed workflow. No immediate subscription cancellation was restored.
- **Legacy UNKNOWN:** no time-based expiry, automatic replay or clearance without exact provider identity. Missing review basis, unknown service ownership and stale cases require adjudication. This pass adds no adjudication/refresh UI. A rejected stale review stays open; a rejected post-reservation check retains UNKNOWN ownership.
- **Collection restrictions:** one current collection owner per booking; historical fees and later different fee/transfer keys require review. Even a failed approved refund retains conservative service blocking. These restrictions require operational acceptance before release.
- **Cross-ledger coverage:** current attendance roster/cancellation/transfers share the bounded booking protocol. Existing purchase approval surfaces, webhook accounting and charge sync retain the prior local changes. Commerce still uses its separate durable ledger; cross-ledger adversarial certification is incomplete. Dashboard/manual/provider-initiated activity and every unrelated payment/entitlement writer are not generalized into this protocol. Checkout/subscription/invoice collection is outside this change.
- **Queue pagination:** oldest 200 reviews and newest 500 replacement candidates remain bounded, with no pagination controls. Exact selected-review payments are now loaded without the replacement cap. Uncertain collections and operation lookup remain unpaginated. The displayed queue is not proof that no other obligations exist; monitoring/backlog coverage remains a release gate.
- **Drain gate:** approve and test retirement of old deployed writers across immutable routes and in-flight invocations. Publication locking alone does not establish quiescence. No global credentials/payment/site fence or old-writer bypass was introduced.
- **Responder gate:** owner must assign responders, monitoring, escalation timing and explicit adjudication for urgent failed-service, duplicate, stale and unknown cases. No legal deadline, automatic refund exception or automatic stale-case clearance is invented.
- **Release gate:** supervisor native/browser evidence, remaining action/cross-ledger cases, clean dependencies, full guarded checks, migration/runtime review and exact-release approval remain required. This local synthetic preview grants no real money authority. No deployment or publication was performed.

## Exact files changed in this four-finding pass

The prior worker's other edits are not part of this list. Machine-readable plain list: `../evidence/four-findings-changed-files.txt`.

- `components/admin/refund-review-queue.tsx`
- `app/(studio)/admin/payments/refund-reviews/page.tsx`
- `app/(studio)/admin/payments/refund-reviews/actions.ts`
- `lib/payments/refund-review.ts`
- `lib/payments/refund-review-stripe.ts`
- `lib/payments/attendance-fee.ts`
- `app/(portal)/instructor/classes/[occurrenceId]/roster/actions.ts`
- `app/(portal)/instructor/classes/[occurrenceId]/transfers/actions.ts`
- `app/(portal)/member/bookings/reschedule/actions.ts`
- `prisma/migrations/20261113010000_refund_review/migration.sql`
- `netlify/database/migrations/20261113010000_refund_review.sql`
- `preview/refund-review/main.tsx`
- `scripts/verify-refund-preview.mjs`
- `tests/integration/refund-review.test.ts`
- `tests/unit/payments/refund-review-ownership.test.ts`
- `tests/unit/payments/refund-review-stripe.test.ts`
- `tests/unit/admin/refund-review-queue.test.tsx`
- `docs/reviews/refund-approval-implementation.md`

## Supervisor commands

Run outside the shared-memory/browser sandbox, from the source checkout:

```sh
cd /Users/gokuramos/Inbox/rhyze-refund-approval-preview/source
PG_BIN=/opt/homebrew/opt/postgresql@17/bin node scripts/test-refund-review.mjs > ../evidence/four-findings-native-supervisor.log 2>&1
node scripts/verify-refund-preview.mjs > ../evidence/four-findings-browser-supervisor.log 2>&1
```

The native runner owns a fresh socket-only `refund_review_test`, verifies database/address/port/user/data_directory before schema or fixtures, applies the exact local migration and stops only its own cluster. It never uses an inherited production database for this suite. Browser verification exercises the built local files, fictional identity, approval/reconciliation and 390/768/1440 widths.

Public artifact directory: `/Users/gokuramos/Inbox/rhyze-refund-approval-preview/evidence/public-refund-preview/`. Only `index.html`, `preview.js`, `preview.css`, `_headers` belong to the public artifact. No publication command is included or authorized by this report.

Status: all four bounded code fixes implemented and focused local checks passed; native and browser verification remain blocked. Not production-ready or natively concurrency-certified.
