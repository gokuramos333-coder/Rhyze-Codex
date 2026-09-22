# Daily warning reliability — September 21, 2026

## Goal and scope

Correct the four reported warning causes without changing customer balances, bookings, role policy, payment webhooks, cancellation deadlines, or email schedules. Prepare website changes for review; do not deploy. Preserve the original dirty project and the unrelated untracked `app/api/ops/` work in this existing production-source worktree (base `53b2f56`).

## Architecture

- Read-only page renders: remove the legacy hard-coded booking reconciliation writer from public event and admin roster renders; retain existing read filters and authorized mutation workflows.
- Authenticated monitoring: explicit approved role cases, including OWNER access to instructor views and strict MEMBER/INSTRUCTOR admin denials. Collect independent role results without hiding earlier passes.
- Stripe safety sync: opt-in, bounded retry only for failures known to occur before connection establishment. Never replay ambiguous post-send errors or HTTP/application failures. Keep hourly schedule and immediate webhooks.
- Database telemetry: validated private production-readonly configuration, read-only transaction, aggregate-only output, no localhost/environment fallback and no credential leakage. Keep warnings truthful where coverage is unavailable.
- Existing daily automation: preserve daily 5 AM and Telegram delivery. Point to verified monitor scripts and distinguish prepared source from deployed production code. Do not remove unsafe production-route exclusions before deployment.

## Execution and verification

1. Capture baseline tests and production deployment metadata.
2. Add failing render regressions for all three GET paths; remove writers; run targeted tests.
3. Add role-policy regression tests; correct smoke runner; run dedicated production test accounts safely.
4. Add retry regressions (bounded connection-only retries, no payment replay, redacted errors); implement and test.
5. Add fail-closed read-only telemetry tests; run production aggregates; update existing monitoring configuration.
6. Run full tests, typecheck, lint, Prisma validation and production build. Review diff and record evidence/remaining risks. No deployment, real checkout, email send, financial mutation or dependency-wide upgrade.

Netlify scheduled functions are limited to 30 seconds; retry budget must leave headroom: https://docs.netlify.com/build/functions/scheduled-functions/ . Dependency advisories remain separately reported unless a scoped safe fix is verified.
