# September 22 release safeguards — no production publication

## Scope and outcome

User approved safeguards only. No customer payments, bookings, memberships, attendance, email delivery, production data, or Netlify permissions were changed. Existing automation-account HTTP logins update only normal session/last-login state.

- Implementation commits: `f0e433f` and `6a47054` in the canonical `rhyze-sign-in-plan-repair` checkout.
- Actual deployed application remains source `6c20eaa`, deploy `6ab2a8b3789eb5b336e1a842` (production context, READY).
- `deploy:production` now uses the guarded workflow, with separate `release:check` and `release:verify` commands. It cannot silently skip verification or promote a preview.
- The Netlify safety plugin checks source/configuration/project identity before the build and after function bundling, before publication. A local per-site lock serializes supported releases.
- Source is committed, archived, checksummed, and built outside any parent package/Git root, using its own locked dependencies. Added source files and changed file types/hashes are rejected. Recovery bundles and sanitized receipts are retained locally.
- Temporary database permissions still require explicit release-specific approval; the workflow never grants them and will not call a release verified until they are OFF again.

## Verification

The complete check-only workflow for source `6a4705478557c3825e988760c3c14c9baf1fc8d0` finished `CHECKED_NOT_DEPLOYED` at approximately 1:16 PM EDT. Publication was never attempted.

- 281 test files / **1,272 tests passed**, zero failed and zero skipped, including the explicit disposable PostgreSQL integration suites.
- Typecheck, lint, Prisma validation, and isolated Next.js production build passed.
- Netlify CLI 27.8.0 resolved the correct site and the external snapshot's configuration. Production build dry-run passed; no full Netlify publication was performed.
- Authenticated OWNER, INSTRUCTOR, and MEMBER permitted/denied routes passed. Public pages/icons and **36 generated JS/CSS assets** passed.
- The running admin integrations page reported Stripe LIVE, checkout ready, and webhook secret configured.
- Independent review found and verified fixes for parent-root resolution, concurrent local releases/build-boundary drift, and snapshot file-set/type validation; no remaining Important findings.
- Targeted plugin tests exercise the actual pre/post-build hooks with controlled provider responses, including rejection of a competing release. They do not contact production or upload anything.

Local evidence: `.releases/6a4705478557-Vc34ou/release.json` and `tests.json`.

Final `release:verify` also returned `VERIFIED` after the rehearsal: the published deploy was unchanged, all three role checks and 36 assets passed, Stripe mode remained LIVE, and the provider returned the read-only database binding confirming PAT access was OFF. Receipt: `.releases/verify-IUHimA/release.json`. The full 1,272-test suite was rerun successfully after tightening the entrypoint test so it rejects a raw deploy-command regression before spawning any child process.

- Source archive SHA-256: `43515e5cc20f07e5094e2710c12e01777c501c9fb582684fca4df431bc3eb9e8`.
- Git recovery bundle SHA-256: `7efa636bb719492793f871586f5a91cf36961193ca0fbbdd6bbdd3ad7702ddb4`.
- Source location is recorded in the private local receipt; OS temporary build directories are not the recovery archive.

## Rehearsal findings

The initial check stopped before upload when the CLI's `NETLIFY_SITE_ID` shortcut reported an existing link without saving `.netlify/state.json`. The link step now omits that environment shortcut and explicitly links by `--id`; API/build/deploy still pin the production site. Regression and actual isolated link/status/dry-build checks passed. Another read-only API attempt failed transiently before preparation; independent API/CLI diagnostics recovered and the subsequent complete check passed. Neither failure changed production.

## Limits

No live card transaction, settlement, new signed Stripe payment delivery, email send, or browser interaction was exercised. Masked Netlify keys are not treated as independent proof of valid Stripe credentials; unchanged configuration plus authenticated LIVE runtime checks are required. Bank/provider outages are still possible.

Netlify publication does not offer atomic compare-and-swap here. The local lock and final build boundary reduce concurrency risk, but do not prevent someone publishing manually/from another machine in the remaining upload window. Do not bypass the documented workflow. No automatic rollback, recurring monitor, or extra production deployment was added.

See [production-release.md](../operations/production-release.md) for commands and release-specific permission handling.
