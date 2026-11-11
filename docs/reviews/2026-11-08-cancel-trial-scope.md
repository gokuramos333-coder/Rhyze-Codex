# Cancel trial scope — source ready for supervisor

Status: **source ready, uncommitted**. Implemented the user's explicit narrowed scope. `../SCOPE-UPDATE.md` was absent on the initial read and subsequent checks; `../CONTINUATION.md` and the current diff were read before changes.

## Found / changed

- The experimental trial-history override hid ordinary admin checkout, and its server gate rejected any former trial client. The ordinary form and checkout implementation now exactly match their pre-experiment `HEAD^` versions. Existing current-membership, product, pricing and checkout-session safeguards remain. [Form](../../components/admin/AdminMembershipStartForm.tsx:14), [checkout](../../lib/domain/memberships/admin-membership-checkout.ts:81).
- Extracted the actual [CancelIntroTrialForm](../../components/admin/CancelIntroTrialForm.tsx:7), removed the unfinished upgrade/first-period-discount/checkout panel and its unused calculator, and changed the [admin page](../../app/(studio)/admin/members/[userId]/page.tsx:58) to import only cancellation. No activation logic was added.
- Cancellation backend, policy and the 49-case real-PG integration test file are byte-for-byte unchanged from this narrowing turn's input. The Sales linking guard remains scoped to granting a trial, while ordinary linking stays available. Two additional unit cases confirm ordinary linking after cancellation without restoring access. [Guard](../../lib/admin/stripe-payment-linking.ts:42), [regressions](../../tests/unit/memberships/intro-trial-review-regressions.test.ts:262).
- The [static fixture](../../tests/fixtures/cancel-trial-preview.tsx:1) renders only the actual cancellation component, with active, paused/proven-history, and review-blocked scenarios. All submissions are inert. Renamed scripts are `scripts/preview/build-cancel-trial.mjs`, `check-cancel-trial.mjs`, and `verify-cancel-trial-browser.cjs`. Their output is a separate `../cancel-trial-owner-preview/`; evidence names start with `cancel-trial-`. The browser checker accepts loopback HTTP only. No preview was built or published.
- The removed experimental code remains in Git baseline `361d05e6e37a9a56a0c6c39d3d1ce196534e6fa9`. Existing `../owner-preview/`, the retained RED source, and historical receipts were not rewritten.

## Verified

- Test-first RED: `../evidence/cancel-scope-unit-red-01.log`: **3 failed / 12 passed**, for hidden ordinary checkout, blocked ordinary checkout, and the upgrade controls in the preview.
- Initial GREEN: `../evidence/cancel-scope-unit-green-01.log`: **15 passed**.
- Targeted final tests: `../evidence/cancel-scope-targeted-green-02.{log,json}`: **12 files, 56 passed, 0 failed, 0 skipped/todo**. Includes cancellation UI/payload, preview behavior, checkout, assignments, pricing, membership actions/layout, ordinary payment linking, cancellation/replay, freeze and restoration regressions. Vite's existing config-loader warning remains in the logs.
- Targeted ESLint: exit 0, `../evidence/cancel-scope-eslint-01.log`. All three preview scripts passed `node --check`; `git diff --check` passed. Full typecheck, build, full suite, real-PG reruns and browser/artifact checks were left to supervisor coordination.
- Read and preserved supervisor receipts: native RED `../evidence/continuation-native-red.log` has **20 failed / 24 passed plus one recorded unhandled rejection**; native GREEN `../evidence/continuation-native-green-01.log` has **49 passed**. These are the supervisor's pre-narrowing real-PG results, not new executions by this worker. SHA-256 preservation checks are recorded in `../evidence/cancel-scope-preserved-inputs.json`.

## Risk / handoff

The new static scripts have syntax and fixture-level verification, but the narrowed generated artifact and visual layout have not been built or browser-verified. Supervisor owns remaining full gates and review. Existing historical reports below/elsewhere are not fresh validation of this UI delta. No production/provider/customer operation, activation implementation, publish, commit, push, or independent-review claim was made.
