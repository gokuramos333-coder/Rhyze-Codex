> Historical correction handoff. Native tests/build/browser verification subsequently passed; see [final native verification](2026-11-08-trial-upgrade-native-verification.md) and `../IMPLEMENTATION.md`. The historical sandbox failures below are retained evidence, not current infrastructure blockers.

# Scoped trial cancellation corrections

Found: independent review identified checkout replay, in-flight fee, attendance, pending-freeze and loopback-identity issues. Follow-up review additionally reproduced stale Sales grant replay. This revision remains in the actual worktree for the parent to commit; no new Git bundle or alternate commit repository was created.

Changed:

- Trial checkout fulfillment acquires the purchase lock and reads cancellation/restriction/refund state before access or financial writes (`lib/payments/webhook-processor.ts:428`).
- Cancellation refuses all trial or ambiguous booking history, including historical/cancelled bookings. It performs no booking writes; proven unrelated access/history stays untouched (`lib/domain/memberships/cancel-intro-trial.ts:131`). This is the explicitly authorized fail-closed subset, not a repair or migration of legacy fee/attendance writers.
- Unresolved freezes reject cancellation (`lib/domain/memberships/cancel-intro-trial.ts:104`). Trial maintenance locks and rereads current membership/freeze/receipt state before starting or resuming (`app/api/jobs/memberships/route.ts:12`).
- Sales trial grants reject already-linked records; stale unmatched payments lock and reread their purchase before rejecting an existing membership (`lib/admin/stripe-payment-linking.ts:42`). Initial unmatched grant behavior remains available.
- The form and success/error notices describe the restricted behavior. Known booking/freeze conflicts disable the button; the server remains authoritative (`components/admin/TrialUpgradePanel.tsx:192`, `app/(studio)/admin/members/[userId]/page.tsx:697`).
- The PostgreSQL guard uses `host(inet_server_addr())`; exact database, literal loopback, explicit port and owned-directory checks remain (`tests/integration/intro-trial-cancellation.test.ts:40`).
- Checkout/email remain disabled. No broader payment migration, production action, deployment, push or commit occurred.

TDD evidence under `../evidence/`: `review-fixes-red.log` (8 assertions), `review-freeze-red.log` (4), `review-ui-red.log` (2), `review-sales-both-red.log` (2). Corresponding GREEN runs are retained. These exercise actual writers behind stateful doubles, not PostgreSQL. The updated guarded integration suite has **22 collected cases**, not 22 executed/passing cases.

The final independent follow-up is `../FOLLOWUP-REVIEW.md`: no remaining confirmed P1/P2 in scope; native database verification remains pending with the parent.

## Verified locally

- Final `npm run test:unit -- --no-file-parallelism`: **2,062 passed, 1 failed; 364 files passed, 1 failed**. The sole failure is `tests/unit/launch/production-release.test.ts` → `the npm publishing entrypoint refuses invocation without reviewed release inputs`, because its child `tsx` process returned `listen EPERM` creating an IPC pipe. Receipt: `../evidence/review-unit-final.log`. A native rerun is required; this is not reported as a passing full suite or as a final infrastructure blocker.
- Final typecheck passed: `../evidence/review-typecheck-final-2.log`. The earlier test-extension typing error remains in `review-typecheck-final.log`; the test adapter was corrected and the real check rerun.
- Final lint passed: `../evidence/review-lint-final.log` (Next lint deprecation notice only).
- Preview build and inert functional check passed: `../evidence/review-preview-build-final.log`, `review-preview-functional-final.log`. Both available and blocked cancellation forms are included; checkout/email stay disabled; exact $78/$92 terms verified.
- `git diff --check` passed. Integration collection succeeded with 22 cases (`../evidence/review-integration-collected.log`). No PostgreSQL test or native production build/browser result is claimed for this revision.

## Required native verification

The existing owned-cluster runner is the exact native full-test rerun. It provisions a fresh cluster, installs schema/constraints, passes the real release environment allowlist, runs the complete suite sequentially, records results and stops its own cluster. Inspect the generated receipt's `status`/`testExitCode` and the Vitest summary: the historical Python runner does not propagate a nonzero Vitest exit to its own exit status:

```sh
python3 ../verify-owned-db.py > ../evidence/native-postgres-review-fixed.log 2>&1
```

Alternatively, run from this source directory after exporting `CALLBACK_TEST_DATABASE_URL` and `TRIAL_TEST_DATABASE_DIR` for the parent's own disposable cluster. URL must use literal `127.0.0.1`, an explicit port, database `callback_test`, and no query/fragment. Directory must equal the server's real `data_directory`. Do not reuse another worker's cluster or weaken the guard. Schema and reviewed SQL-only constraints must already be installed by the parent.

```sh
: "${CALLBACK_TEST_DATABASE_URL:?Export the parent-owned callback_test URL}"
: "${TRIAL_TEST_DATABASE_DIR:?Export the parent-owned data_directory}"
NODE_ENV=test EMAIL_DELIVERY_ENABLED=false npm test -- tests/integration/intro-trial-cancellation.test.ts tests/unit --no-file-parallelism
```

This includes the release-entrypoint unit test that needs a native rerun. For that single rerun:

```sh
npm test -- tests/unit/launch/production-release.test.ts --no-file-parallelism
```

The parent also owns the current-source production build and browser verification:

```sh
npm run build
node scripts/preview/build-trial-upgrade.mjs
node scripts/preview/check-trial-upgrade.mjs
```

Browser-inspect `../owner-preview/index.html` at desktop/tablet/320px and a narrow desktop panel: both unbooked and blocked-booked trial forms, $78/$92 terms, disabled checkout/email, no overflow. The local functional check does not establish browser layout. The refreshed `../trial-upgrade-preview.zip` contains only `_headers`, `index.html`, `preview.css`, `preview.js`; no public preview or deployment was made.

Risk: native DB concurrency/build/browser results and parent commit remain outstanding. No paid checkout should be enabled until deferred activation and aligned renewals are independently implemented and verified. Old Git bundle/receipt files describe an earlier snapshot and are not current source artifacts.
