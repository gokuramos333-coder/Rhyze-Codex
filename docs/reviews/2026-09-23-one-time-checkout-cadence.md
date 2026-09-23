# One-time checkout cadence safeguard

## Found

Production deploy `6ab2a8b3789eb5b336e1a842` identifies source `6c20eaa`; reviewed clean source `bbe8e64` adds the guarded release tooling. Work was isolated from concurrent changes in other worktrees.

Eight failed 8-Class Pack purchase attempts on September 22 EDT match eight Netlify server-handler errors on September 23 UTC (01:24–01:26 and 03:36): Stripe rejected payment mode with a recurring price. This was session setup failure, not evidence of a card decline. A read-only production product query confirms ONE_TIME, 17900 cents, customPlanType QUARTERLY_8_CLASS_PACK, and a stored Stripe price. Do not reinterpret a three-month validity marker as consent to recurring billing.

## Changed

All ONE_TIME products entering member checkout now use inline USD price_data built from the authorized server-side product, following the existing event checkout pattern. A stale/missing/test-mode catalog price ID therefore cannot select recurring billing or a wrong catalog amount for packs, trials or drop-ins. Recurring memberships retain existing Stripe price identity for plan-change compatibility. No catalog, financial, membership, credit or customer data was modified. No retry or charge was attempted. Existing provider-mode guards, product availability, waivers, discounts, metadata and fulfillment remain unchanged.

## Verification

- Regression reproduced the exact provider rejection in the real server action with a mocked Stripe boundary, then passed with the fix. The test also verifies posted amount/cadence cannot override the database.
- New shared-builder tests cover packs/trials/drop-ins, missing one-time price, monthly/yearly identity, absent recurring price, invalid amounts and action wiring.
- Full suite: 277 files passed / 5 skipped; 1226 tests passed / 58 skipped (database-dependent integrations lack explicit disposable local connections).
- Typecheck, lint, Next production build and git diff check passed. Existing test harness warnings remain; lint has no warnings/errors.
- Fresh independent Codex review (`gpt-5.5`, session `01a0ce19-2d59-7981-885a-d0a8ac313c76`) exited 0 and found no blocking security or logic regressions. Its attempted focused test run was blocked by the read-only sandbox, not counted as a test pass. Evidence: `~/Inbox/rhyze-recurring-audit/checkout-fix-review-release.txt` and `.log`. This supersedes the unverified provenance of the earlier review JSON and does not count the failed unsupported-model invocation.
- This is local execution and read-only live diagnosis, not a paid checkout verification.

## Release gate

Use the existing guarded release workflow, not raw Netlify upload or preview promotion. It requires a committed reviewed source, pinned deploy/source, explicit disposable test database URLs with zero skipped tests, authenticated smoke checks and an actual writable managed production binding. Temporary PAT production DB access needs explicit per-release approval and must be restored OFF. No permission or deployment changes were made by this fix. Existing live deploy remains unchanged until these gates pass.

Legacy recurring-link experiments were paused/stashed after the incident scope was corrected; none are included in this fix. Jolie's billing/entitlements were not touched.
