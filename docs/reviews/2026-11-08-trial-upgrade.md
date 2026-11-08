> Historical snapshot. Final passing native checks and the independent static preview are in [the native verification report](2026-11-08-trial-upgrade-native-verification.md). Earlier infrastructure blockers, booking-removal and alternate-commit descriptions do not describe the final artifact. Operational cancellation/provider blockers remain.

# Trial cancellation and paid-offer review artifact

Status: implementation prepared; NOT release-ready. No production writes, customer actions, email sends, pushes, application deployments or migrations were performed.

## Scope and decisions

- The per-client Memberships section offers a separately confirmed Cancel trial control only for active, unexpired, one-time seven-day intro products. The server requires an authenticated admin-area user and rechecks the persisted active OWNER/ADMIN/MANAGER role. `lib/domain/memberships/cancel-intro-trial.ts` owns the atomic cancellation and audit receipt.
- Cancellation expires only the linked unlimited trial account, cancels attributed future confirmed trial bookings, and retains purchases, invoices, payments, refunds, ledger history, other accounts and other bookings. Legacy trial bookings without an account need exactly one historical trial. Missing or inconsistent provenance, attendance, booking financial history, billing ownership or a claimed email stops the transaction for review.
- Occurrence, booking and shared entitlement locks serialize supported writers. Financial row locks follow Purchase → Membership → CreditAccount and use NOWAIT, avoiding waits on legacy refund settlement. Relevant email rows are locked; PROCESSING messages block cancellation, while QUEUED messages can be cancelled before the worker claims them. An atomic audit receipt makes retries idempotent. A changed booking roster retries with a new lock scope.
- The offer calculator exposes a flat first-period amount or explicit percentage. $78 then $92 is an exact flat offer; 15% of $92 yields $78.20. The offer duration is first-period-only. It does not create a provider coupon or financial record.
- New trial-upgrade checkout and checkout email remain disabled. Existing ordinary admin checkout is rejected server-side for clients with intro-trial history, including after cancellation. Other existing actions are preserved.

## Provider blocker

`lib/domain/memberships/admin-membership-checkout.ts` creates an ordinary subscription (`mode: 'subscription'`). `lib/payments/webhook-processor.ts` creates recurring memberships activated at the payment event (currently line 988). This source does not implement paid-upfront first-scheduled-class activation with a hard 14-day automatic start and aligned recurring renewal. No safe deferred billing flow has been verified. The UI states the blocker rather than offering immediate-start checkout as that policy. Studio cancellation never extends the 14-day deadline. Existing active paid memberships remain outside this change.

## Verification evidence and remaining gates

Evidence is retained in the task directory's `evidence/` folder, outside the source snapshot.

- Actual RED assertions: `trial-red-assertions.log` (7 failed), `checkout-guard-red.log` (3 failed), `owned-directory-red.log` (1 failed).
- GREEN: pricing/UI/checkout tests (30); expanded related membership/admin set (148); owned-directory release-builder checks (2). Typecheck, lint and Prisma schema validation passed.
- Real PostgreSQL initialization failed with `shmget: Operation not permitted`, including mmap configuration. No pre-existing or other worker database was used, and no guard was weakened. The 12-case PostgreSQL suite is prepared but has NOT executed its assertions. Missing database declarations fail the suite rather than silently skipping it. This does not satisfy the task's real-database RED/GREEN requirement.
- The full test command was run and its failed suites/assertions and skips retained. See the final task report for exact counts; it is not a passing suite or supported release receipt.
- The standard application build failed fetching Bebas Neue and Inter from Google Fonts because network access is unavailable. No substituted font build is represented as a passing production build.
- Independent read-only review identified financial lock inversion, missing booking locks, and the PROCESSING-email race. Code and integration cases were updated. Their actual PostgreSQL concurrency verification remains a release blocker. Deterministic restore/transfer interleavings and wrong-directory fixture-count probes also still need execution/coverage before release.

## Preview

`node scripts/preview/build-trial-upgrade.mjs` builds the actual React components and production Tailwind into `../owner-preview/`. The allowlist is exactly `index.html`, `preview.js`, `preview.css`, `_headers`; hashes are in `../evidence/preview-allowlist.json`. All data is synthetic, actions are inert, and CSP blocks connection/form submission. `node scripts/preview/check-trial-upgrade.mjs` executed the generated bundle and verified exact pricing and disabled checkout/email with no resource loader or network requests.

This is a functional JSDOM artifact check, not browser/visual layout verification. Playwright inspection requires approval that the session's `never` policy cannot grant. The static preview was not uploaded or published. Owner approval of the exact verified preview is still required before any production publication.

## Reproduction

`../verify-owned-db.py` prepares a newly named owned cluster, chooses an unused loopback port, verifies server database/address/port/data_directory, creates the exact accepted disposable test databases, applies the current test schema/index/admission constraints, runs the actual release environment builder and full test suite, and stops only that cluster in `finally`. It was syntax-checked; its successful database lifecycle is unverified in this sandbox. `TRIAL_TEST_DATABASE_DIR` is carried by the real release builder and checked before trial-suite fixture writes.
