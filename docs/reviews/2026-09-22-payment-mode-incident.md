# Payment-mode incident — September 22, 2026

Status: fixes prepared locally; **not deployed**. Production remains affected until a true production-context release is published and verified.

## Verified cause (read-only production and Stripe inspection)

- Published Netlify deploy `6ab1dfc34adb574a165542e3` is READY but has API `context: deploy-preview`, despite serving www.rhyzefitness.com. Its title identifies source `42e093f`.
- Netlify's saved production Stripe secret remains the existing live key (masked suffix PR86). Preview/branch contexts retain the test key (masked suffix HhMv). No credentials were changed or disclosed.
- The prior release process ran a draft with `--context production`, then promoted it. That flag chooses **build** environment variables; it does not make a draft's **runtime** environment production. The CLI determines the deployed context from `--prod`/draft status. The release guide is corrected.
- Amy's pending $199 recovery purchase points to a `cs_test_` session. Stripe test API confirms `livemode=false`, `status=expired`, `payment_status=unpaid`; its success URL is the production domain. Her saved customer exists only in test mode. Live Dashboard search found no customer for her email.
- Susan McCosker has six FAILED $7 purchases (September 22, 10:03–10:08 EDT), all without a Stripe session or payment intent. She has accepted the active waiver and has no prior trial membership. The active trial product's live price cannot be retrieved with the test key: Stripe returns `resource_missing`, explicitly explaining that the object exists in live mode.
- Lori Knoll also has a FAILED single-class checkout on September 21 at 17:07 EDT, without a Stripe session. Do not ask these clients to retry until the release is verified.

## Fixes

- `getStripe` refuses test/restricted-test credentials in all hosted Netlify contexts (including promotable previews), or when the canonical app URL is the live Rhyze domain. Sandbox payment testing is intentionally local-only with isolated data. Readiness reports fail closed. An existing cached client cannot survive a key change.
- Signed non-live webhook events are ignored before any database write on the live site. The payment processor independently refuses non-live events; reconciliation validates its whole charge batch before database work. Synthetic checkout events retain Stripe's `livemode` value.
- On explicit member billing consent, an unpaid Somble recovery test attempt can be repaired. It requires the expected Stripe account, a live Stripe balance response, the stale customer being absent from live mode, no live email match, and no other Stripe-backed purchase, membership, payment, or commerce references. A serializable transaction, compare-and-set customer attachment, and an audit record preserve old IDs and prevent overwriting a concurrent live customer. No card is charged by this repair: the member must complete a new hosted checkout.
- The entire scheduled Stripe job stops if payment configuration is unsafe, including contact synchronization, so a key-mode failure cannot mutate retry/backoff state either.
- Production release instructions require `--prod --context production`, prohibit promoting preview artifacts, and require checking the published deploy's actual context and runtime LIVE payment readiness.

## Verification

- Reproduced the price-mode mismatch with a read-only Stripe request; no payment executed.
- Regression tests initially failed for the wrong-mode credential, test-event processing, missing synthetic livemode, and stale recovery behavior, then passed after changes.
- Final full suite: **279 files / 1,227 tests passed**, including disposable PostgreSQL integration suites. The previous temporary local database no longer existed; recreated isolated local test databases and restored the case-insensitive email index required by the identity migration. No production schema was modified.
- Final production build, typecheck, lint, and Prisma validation passed. Independent read-only review found no remaining Critical/Important findings after tightening the preview mode guard, customer attachment race, and whole-job early exit.
- Public home, memberships, and schedule returned HTTP 200. Anonymous member/admin/instructor pages redirected to sign-in. Netlify's deployment binding was rechecked and is still `netlifydb_readonly`; no deploy or permission change was attempted.
- Read-only production telemetry: 20 upcoming occurrences, all with instructor coverage; 10 confirmed upcoming bookings. This is a stored-data check, not a completed live checkout or a proof of every portal operation.

## Other incident observations / remaining verification

- The test-mode reconciliation imported 20 recent sandbox charge records (all unlinked to members/purchases) into the production ledger, including synthetic test-clock charges. Existing verified-revenue logic excludes unlinked records, but these remain visible as unmatched records and raw telemetry. They were **not deleted, refunded, or relabeled** during diagnosis. Two older July test-event-linked records also remain. Review/quarantine separately without destroying financial audit history; never treat test charges as money received.
- Amy's repair prerequisites were checked read-only: zero other Stripe purchases, subscriptions, payment records, or commerce checkouts. Her benefits and September amount/October renewal date were not changed during diagnosis.
- No production payment, member, booking, email, or credential writes were performed during this task.
- Deployment currently requires an actual writable managed production DB binding. Explicit confirmation was requested for temporarily enabling Netlify PAT production database access, restoring OFF afterward. Until answered, do not change that security setting or publish with a read-only binding.
- After publication: verify deploy context production, live catalog access, webhook configuration, public assets, protected portal redirects, and authenticated role checks. Confirm Amy can create a live replacement checkout; Susan and Lori can retry without being charged twice. Actual payment success requires the customers to complete payment; do not claim 100% success from unit tests alone.

References: [Netlify CLI deploy flags](https://cli.netlify.com/commands/deploy/), [Netlify deployment contexts](https://docs.netlify.com/deploy/deploy-overview/), [Stripe API authentication and modes](https://docs.stripe.com/api/authentication).
