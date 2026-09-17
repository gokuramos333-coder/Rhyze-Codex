# Production health checks

## Daily read-only command (this host)

```sh
cd /Users/gokuramos/Projects/rhyze-instructor-repair
RHYZE_READONLY_DB_CONFIG="$HOME/.config/rhyze/production-readonly.json" \
RHYZE_HEALTH_OUTPUT="$HOME/Inbox/rhyze-health/latest.json" \
node scripts/production-health.cjs
```

The config is outside git, directory mode 700/file mode 600. It contains only the verified production read-only connection and `target: production`. Never print, commit, or attach it. Rotate it through the database provider when necessary; if it expires, report NOT TESTED rather than borrowing a write credential. No `/tmp` dependency. A DB transaction explicitly sets READ ONLY. The scanner performs only public GETs, no auth submissions, emails, bookings or charges.

Exit codes: 0 means every automated/required check passed; 1 means FAIL/ATTENTION; 2 means incomplete/NOT TESTED. Since signed-in portal E2E, provider settlement, and email delivery are intentionally not performed, this command alone cannot produce 100%. Inspect the JSON even when exit is nonzero. `complete: false` or an old timestamp is incomplete evidence, never a fresh pass.

`healthScore.percent = floor(100 * PASS / TOTAL)` includes required NOT TESTED categories in its denominator; any failure/incomplete category yields ATTENTION regardless of percentage. The report exposes exact denominator/counts. Routes/assets are individually counted: this is scan coverage, not an availability SLA or probability the application is bug-free. A broader daily checklist must retain its own required checks rather than relabel this bounded scan as complete E2E.

Checks: two-depth canonical public link/static-asset crawl; every future scheduled DB class booking URL and event URL; class filters; anonymous protected-gate redirect; unauthenticated session response; current instructor assignment access; historical assignment exceptions; cancelled-class bookings; cancelled-booking attendance; attendance identity match; negative finite credit balances; orphan ledger booking IDs; purchase refund bounds; paid timestamps; eligible discounted redemption without commission; earned/paid commissions against invalid purchase status; failed emails from last 24h.

Limits: no provider-level Stripe reconciliation, cancellation-policy/credit-ledger semantic proof, real member purchase, password reset delivery, or logged-in instructor session. A 200 route is not proof a person can complete checkout. Query failures must remain NOT TESTED. Financial/historical alerts need audited owner confirmation, not automatic correction.

## Release safeguards

1. `npm test`, `npm run typecheck`, `npm run lint`, `npx netlify build --context production`.
2. Confirm site ID `e7002b82-50f2-4760-8a35-e4f9591bec4f` and canonical `https://www.rhyzefitness.com` before deploy.
3. Keep dependencies local to worktree (never symlink all node_modules); inspect packaged Next runtime.
4. Deploy with `npx netlify deploy --prod --no-build --skip-functions-cache` after a successful matching build.
5. Run the read-only scanner, inspect protected redirects, rendered mobile/desktop schedule, plan-specific membership links, and recent function error logs. Capture immutable deploy ID and fresh database readback.
6. Preserve scoped changes in git; do not merge unrelated dirty branches or rewrite financial history to make the dashboard green.

## Assignment safety

Admin schedule create/copy/recurrence/update/bulk paths use `requireAssignableInstructor`: real ACTIVE staff, password-enabled, active instructor profile (or explicit studio-owner exception), non-placeholder email. Display substitute names do not grant ownership. Approved owners/admin/managers can enter instructor operational views; instructors still manage only exact owned occurrences.

Legacy `sync-owned-catalog`, seed and September-preview writers now refuse hosted DB URLs before creating PrismaClient. The old preview script checked only the app URL, which did not establish database safety. These demo/import writers are not production scheduling tools. Somble attendee imports change roster/capacity, not instructor assignment. Approval now requires an activated applicant, limits automatic directory linking to passwordless local placeholders and future scheduled classes, and does not move past pay/commission/referral ownership by name. Existing historical assignments remain visible when editing unrelated fields.

## Historical reconciliation

Nine past scheduled assignment exceptions are intentionally unresolved. Each has booking/attendance history. Five have only planned Avery/Dennisse display names and unset pay, three belong to an archived Rachel placeholder, one to a Carla placeholder with no currently eligible matching instructor. Planned names are not proof of who taught or was paid. Confirm teacher, actual class completion/cancellation and payroll treatment, then use explicit audited per-record actions. Do not blanket-change status or financial ownership.
