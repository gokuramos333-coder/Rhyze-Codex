# Trial admin artifact — final native verification

This local-only verification supersedes the infrastructure blockers in the earlier trial-upgrade review snapshots. It is not an application deployment, release approval, or completed customer operation.

## Verified current source

- Baseline: `6ecfbfd4352b964513ad5b7e8ff4dafb11e800bf`, branch `fix/trial-paid-upgrade`.
- Native `python3 ../verify-owned-db.py` full run: **392 files, 2,324 tests passed; zero failed/skipped**, including **22 real PostgreSQL intro-trial-cancellation cases**. Sequential file execution retained deliberate intra-test concurrency. Actual release environment builder was exercised.
- Fresh owned cluster: `../trial-verification-f6jszz3e/data`, loopback port `52754`. Receipt: `../trial-verification-f6jszz3e/receipt.json`: `testExitCode=0`, `stopExitCode=0`; postmaster PID file absent after shutdown. No existing cluster was reused/stopped.
- Current-source typecheck, lint, Prisma validation and standard `npm run build` all exited 0. Prisma's first validation lacked DATABASE_URL; retained failed log and reran with the disposable loopback URL. No live database needed. Build is local only.
- Evidence: `../evidence/native-postgres-review-fixed.log`, `final-native-suite-summary.json`, `final-native-gates.json`, `final-native-{typecheck,lint,build}.log`, `final-native-prisma-with-local-url.log`.
- Static scan: no added hardcoded credential, shell injection, pickle or SQL interpolation matches. The sole eval match is the local JSDOM test of the fixed generated preview bundle (`scripts/preview/check-trial-upgrade.mjs:18`), not user-supplied input or application execution.

## Independent static preview

https://rhyze-trial-review-dbced3.netlify.app

A new standalone site, not the linked Rhyze application. Exactly four allowlisted files: `_headers`, `index.html`, `preview.css`, `preview.js`. Synthetic identities only; no backend, credentials, customer IDs or real email addresses. CSP blocks connections and form submission. Noindex is not access control: the preview is publicly readable.

Canonical and immutable HTML/CSS/JS fetched independently and byte-matched. Desktop 1440px, tablet 768px, mobile 320px and 300px panel inside desktop checked with actual browser; no document overflow, long labels wrap, exact $78/$92 calculation checked, checkout/email disabled. Screenshots and verification JSON are retained outside the source under `../evidence/final-preview-*`. No external requests beyond the three static resources. Published deploy: `6af0f0ca95bc2c6f7e0ca98a`; site: `52947a2c-4bd4-4eae-82b5-264a40bcb4d2`.

Application production deploy remained `6aefcae6d3b6984eaa23b1d5` across the standalone upload. No application push/deployment or customer changes, messages, charges or refunds.

## Retained operational blockers

- Cancellation refuses **any** historical trial-funded or ambiguous booking, irrespective of date/status, and never changes bookings. Zero future bookings is not enough. PAUSED trials are not eligible. This does not solve Estefany's cancellation.
- Operations handoff reports Estefany already PAUSED with an existing pending $78/$92 purchase. No new links or emails were created; no live customer state was queried/changed in this verification.
- Paid-upfront activation on first scheduled qualifying class with automatic hard 14-day cap and aligned recurring renewals is not implemented/verified. Checkout and email remain disabled. Studio cancellation must not extend that deadline; no extra week is permitted.
- Owner approval of the exact preview remains required before any application release. These local checks are not a supported hosted `CHECKED_NOT_DEPLOYED` release receipt or end-to-end payment verification.

Final independent review and resulting commit are recorded in `../FINAL-INDEPENDENT-REVIEW.md` and `../IMPLEMENTATION.md` once completed; historical bundles and receipts are not the current source artifact.
